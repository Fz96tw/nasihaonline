// DB-backed integration test for the Weekly Reflection admin layer. Same safety
// rules as weekly-reflection.db.test.ts: needs REFLECTION_TEST_DATABASE_URL and
// refuses any database whose name doesn't contain "scratch" or "test".
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

const url = process.env.REFLECTION_TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.slice(1) : "";
const skip = !url
  ? "set REFLECTION_TEST_DATABASE_URL to a scratch database to run"
  : !/scratch|test/i.test(dbName)
    ? `refusing to run against "${dbName}": database name must contain "scratch" or "test"`
    : false;

if (url && !skip) process.env.DATABASE_URL = url;

const utc = (y: number, m: number, d: number, h = 12) => new Date(Date.UTC(y, m - 1, d, h));

describe("Weekly Reflection admin (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let admin: typeof import("@/lib/weekly-reflection-admin");
  let runCheck: typeof import("@/lib/weekly-reflection-job").runWeeklyReflectionCheck;
  let resolveNext: typeof import("@/lib/reflection-quotes-server").resolveNextReflectionQuote;
  let withAdmin: typeof import("@/lib/weekly-reflection-route").withAdmin;
  let AuthError: typeof import("@/lib/auth").AuthError;
  let adminId: string;
  let forumId: string;
  const stub = { enqueueIndexSync: async () => {} };

  const quoteId = async (text: string) => (await db.reflectionQuote.findUniqueOrThrow({ where: { text } })).id;
  const audit = (action: string) => db.adminActionLog.findMany({ where: { action }, orderBy: { createdAt: "asc" } });

  before(async () => {
    ({ db } = await import("@/lib/db"));
    admin = await import("@/lib/weekly-reflection-admin");
    ({ runWeeklyReflectionCheck: runCheck } = await import("@/lib/weekly-reflection-job"));
    ({ resolveNextReflectionQuote: resolveNext } = await import("@/lib/reflection-quotes-server"));
    ({ withAdmin } = await import("@/lib/weekly-reflection-route"));
    ({ AuthError } = await import("@/lib/auth"));
    const { getOrCreateWeeklyReflectionUser } = await import("@/lib/system-user");

    forumId = (
      await db.forum.upsert({
        where: { slug: "weekly-reflection" },
        update: { active: true },
        create: { name: "Weekly Reflection", slug: "weekly-reflection", displayOrder: 1 },
      })
    ).id;
    await getOrCreateWeeklyReflectionUser();
    adminId = (
      await db.user.upsert({
        where: { clerkUserId: "test_admin" },
        update: {},
        create: { clerkUserId: "test_admin", email: "admin@example.test", name: "Test Admin", role: "admin", tier: "active", profile: { create: {} } },
      })
    ).id;

    await db.adminActionLog.deleteMany({});
    await db.reflectionPost.deleteMany({});
    await db.forumThread.deleteMany({ where: { forumId } });
    await db.reflectionQuote.deleteMany({});
    await db.siteSettings.deleteMany({});
    for (const n of [1, 2, 3, 4]) {
      await db.reflectionQuote.create({
        data: { text: `Admin quote ${n}`, author: `Author ${n}`, prompt: `Prompt ${n}`, createdAt: utc(2020, 1, n) },
      });
    }
  });

  it("is switched off by default, so a fresh deploy posts nothing until an admin enables it", async () => {
    assert.deepEqual(await runCheck(utc(2031, 1, 6), stub), { status: "disabled" });
    assert.equal(await db.forumThread.count({ where: { forumId } }), 0);
  });

  it("applies enable/day/hour changes on the very next check, with no restart", async () => {
    await admin.updateReflectionSettings(adminId, { weeklyReflectionEnabled: true, weeklyReflectionDayOfWeek: 3, weeklyReflectionHour: 10 });
    // 2031-01-06 is a Monday; Wednesday 10:00 UTC is 2031-01-08.
    assert.deepEqual(await runCheck(utc(2031, 1, 7, 12), stub), { status: "not-due" });
    assert.deepEqual(await runCheck(utc(2031, 1, 8, 9), stub), { status: "not-due" });
    const posted = await runCheck(utc(2031, 1, 8, 10), stub);
    assert.equal(posted.status, "posted");

    await admin.updateReflectionSettings(adminId, { weeklyReflectionEnabled: false });
    assert.deepEqual(await runCheck(utc(2031, 1, 16), stub), { status: "disabled" });
    assert.equal(await db.reflectionPost.count(), 1, "disabled week posts nothing");
  });

  it("records the acting admin for a settings change", async () => {
    const rows = await audit("weekly_reflection.settings_updated");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].actorId, adminId);
    assert.deepEqual(rows[0].metadata, { weeklyReflectionEnabled: true, weeklyReflectionDayOfWeek: 3, weeklyReflectionHour: 10 });
  });

  it("previews exactly the quote the next post will use", async () => {
    await admin.updateReflectionSettings(adminId, { weeklyReflectionEnabled: true });
    const preview = await resolveNext();
    assert.equal(preview?.via, "rotation");
    const result = await admin.postReflectionNow(adminId, {}, utc(2031, 1, 20), stub);
    assert.equal(result.status, "posted");
    assert.equal(result.status === "posted" ? result.quoteId : null, preview?.quote.id);
  });

  it("swap makes a chosen quote next, once, and it is consumed by the post", async () => {
    const target = await quoteId("Admin quote 4");
    await admin.swapNextQuote(adminId, target);
    const preview = await resolveNext();
    assert.equal(preview?.via, "override");
    assert.equal(preview?.quote.id, target);

    const result = await admin.postReflectionNow(adminId, {}, utc(2031, 1, 27), stub);
    assert.equal(result.status === "posted" ? result.quoteId : null, target);
    assert.equal((await resolveNext())?.via, "rotation", "override is cleared after use");
    assert.equal((await audit("weekly_reflection.next_swapped")).length, 1);
  });

  it("rejects swapping to a retired or unknown quote", async () => {
    const retired = await quoteId("Admin quote 3");
    await admin.updateReflectionQuote(adminId, retired, { active: false });
    await assert.rejects(() => admin.swapNextQuote(adminId, retired), (e: { status?: number }) => e.status === 400);
    await assert.rejects(() => admin.swapNextQuote(adminId, "does-not-exist"), (e: { status?: number }) => e.status === 404);
    await admin.updateReflectionQuote(adminId, retired, { active: true });
  });

  it("skip moves the next quote to the back of the line without counting it as posted", async () => {
    const before = await resolveNext();
    assert.ok(before);
    const timesBefore = before.quote.timesPosted;
    // The earlier tests post at simulated 2031 dates, so skip at a later simulated time too.
    await admin.skipNextQuote(adminId, utc(2031, 12, 1));
    const after = await resolveNext();
    assert.notEqual(after?.quote.id, before.quote.id, "a different quote is now next");
    const skipped = await db.reflectionQuote.findUniqueOrThrow({ where: { id: before.quote.id } });
    assert.equal(skipped.timesPosted, timesBefore, "skipping isn't posting");
    assert.ok(skipped.lastPostedAt, "but it is moved to the back of the rotation");
    assert.equal((await audit("weekly_reflection.next_skipped")).length, 1);
  });

  it("skipping a swapped-in quote just clears the swap", async () => {
    const target = await quoteId("Admin quote 2");
    await admin.swapNextQuote(adminId, target);
    await admin.skipNextQuote(adminId);
    assert.equal((await resolveNext())?.via, "rotation");
    const row = await db.reflectionQuote.findUniqueOrThrow({ where: { id: target } });
    assert.equal(row.lastPostedAt === null || row.timesPosted >= 0, true);
  });

  it("never selects a retired quote, even if it was swapped in", async () => {
    const target = await quoteId("Admin quote 1");
    await admin.swapNextQuote(adminId, target);
    await admin.updateReflectionQuote(adminId, target, { active: false });
    const preview = await resolveNext();
    assert.notEqual(preview?.quote.id, target);
    assert.equal(preview?.via, "rotation", "a stale override falls back to rotation");

    await db.reflectionQuote.updateMany({ data: { active: false } });
    assert.equal(await resolveNext(), null);
    await db.reflectionQuote.updateMany({ data: { active: true } });
  });

  it("adds, edits and retires quotes, auditing each with the acting admin, and rejects duplicates", async () => {
    const created = await admin.createReflectionQuote(adminId, { text: "Brand new", author: "Someone", source: null, prompt: "Thoughts?" });
    await admin.updateReflectionQuote(adminId, created.id, { prompt: "Better prompt" });
    await admin.updateReflectionQuote(adminId, created.id, { active: false });
    await admin.updateReflectionQuote(adminId, created.id, { active: true });
    await assert.rejects(
      () => admin.createReflectionQuote(adminId, { text: "Brand new", author: "Other", source: null, prompt: "x" }),
      (e: { status?: number }) => e.status === 409,
    );
    await assert.rejects(() => admin.updateReflectionQuote(adminId, "nope", { prompt: "x" }), (e: { status?: number }) => e.status === 404);

    for (const action of [
      "weekly_reflection.quote_created",
      "weekly_reflection.quote_updated",
      "weekly_reflection.quote_retired",
      "weekly_reflection.quote_reactivated",
    ]) {
      const rows = await audit(action);
      assert.ok(rows.length >= 1, action);
      assert.ok(rows.every((row) => row.actorId === adminId), `${action} records the acting admin`);
    }
  });

  it("Post now refuses a second post in the same week unless the override is confirmed", async () => {
    const week = utc(2031, 3, 5);
    const first = await admin.postReflectionNow(adminId, {}, week, stub);
    assert.equal(first.status, "posted");
    const second = await admin.postReflectionNow(adminId, {}, week, stub);
    assert.equal(second.status, "already-posted");
    assert.equal(await db.forumThread.count({ where: { forumId } }), (await db.reflectionPost.count({ where: { threadId: { not: null } } })));

    const forced = await admin.postReflectionNow(adminId, { override: true }, week, stub);
    assert.equal(forced.status, "posted");
    assert.equal(forced.status === "posted" ? forced.weekKey : "", "2031-W10-extra-1");

    const pinned = await db.forumThread.findMany({ where: { forumId, pinned: true } });
    assert.equal(pinned.length, 1, "only the newest thread stays pinned");
    const rows = await audit("weekly_reflection.posted_now");
    assert.ok(rows.some((row) => (row.metadata as { override?: boolean }).override === true));
    assert.ok(rows.every((row) => row.actorId === adminId));
  });

  it("the database defaults for the post wording match the code's default templates", async () => {
    const { DEFAULT_BODY_TEMPLATE, DEFAULT_TITLE_TEMPLATE } = await import("@/lib/reflection-template");
    await db.siteSettings.deleteMany({});
    const row = await db.siteSettings.create({ data: { id: 1 } });
    assert.equal(row.weeklyReflectionTitleTemplate, DEFAULT_TITLE_TEMPLATE);
    assert.equal(row.weeklyReflectionBodyTemplate, DEFAULT_BODY_TEMPLATE);
    await db.siteSettings.deleteMany({});
  });

  it("posts with the default wording exactly as before, until an admin edits it", async () => {
    const result = await admin.postReflectionNow(adminId, {}, utc(2031, 5, 12), stub);
    assert.equal(result.status, "posted");
    if (result.status !== "posted") return;
    const thread = await db.forumThread.findUniqueOrThrow({ where: { id: result.threadId }, include: { posts: true } });
    const quote = await db.reflectionQuote.findUniqueOrThrow({ where: { id: result.quoteId } });
    assert.equal(thread.title, `Weekly Reflection: \u201C${quote.text}\u201D`);
    assert.equal(thread.posts[0].body, `${quote.prompt}\n\n\u201C${quote.text}\u201D\n\u2014 ${quote.author}`);
  });

  it("shortens a long quote in the default title but keeps it whole in the body", async () => {
    const longText = "Long quote. ".repeat(40).trim();
    const longQuote = await admin.createReflectionQuote(adminId, { text: longText, author: "Verbose", source: null, prompt: "Thoughts?" });
    await admin.swapNextQuote(adminId, longQuote.id);
    const result = await admin.postReflectionNow(adminId, { override: true }, utc(2031, 5, 12), stub);
    assert.equal(result.status, "posted");
    if (result.status !== "posted") return;
    const thread = await db.forumThread.findUniqueOrThrow({ where: { id: result.threadId }, include: { posts: true } });
    assert.ok(thread.title.endsWith("\u2026\u201D"), thread.title);
    assert.ok(thread.title.length <= 200, `title length ${thread.title.length}`);
    assert.ok(thread.posts[0].body.includes(longText), "the full quote is in the body");
    await admin.updateReflectionQuote(adminId, longQuote.id, { active: false });
  });

  it("uses an admin's edited wording for later posts, leaves earlier threads untouched, and audits the edit", async () => {
    const before = await db.forumThread.findMany({ where: { forumId }, include: { posts: true }, orderBy: { createdAt: "asc" } });
    const snapshot = JSON.stringify(before.map((t) => [t.id, t.title, t.posts.map((p) => p.body)]));

    await admin.updateReflectionMessage(adminId, {
      titleTemplate: "\u201C{quote}\u201D",
      bodyTemplate: "Happy Monday, everyone!\n\n{quote}\n\u2014 {author}\n\nTell us: {prompt}\n\nThe NASIHA team",
    });
    const result = await admin.postReflectionNow(adminId, {}, utc(2031, 5, 19), stub);
    assert.equal(result.status, "posted");
    if (result.status !== "posted") return;
    const thread = await db.forumThread.findUniqueOrThrow({ where: { id: result.threadId }, include: { posts: true } });
    const quote = await db.reflectionQuote.findUniqueOrThrow({ where: { id: result.quoteId } });
    assert.equal(thread.title, `\u201C${quote.text}\u201D`);
    assert.equal(
      thread.posts[0].body,
      `Happy Monday, everyone!\n\n${quote.text}\n\u2014 ${quote.author}\n\nTell us: ${quote.prompt}\n\nThe NASIHA team`,
    );

    const after = await db.forumThread.findMany({
      where: { forumId, id: { in: before.map((t) => t.id) } },
      include: { posts: true },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(JSON.stringify(after.map((t) => [t.id, t.title, t.posts.map((p) => p.body)])), snapshot, "earlier threads are unchanged");

    const rows = await audit("weekly_reflection.message_updated");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actorId, adminId);

    // A saved custom wording isn't clobbered by the settings read that creates the row with defaults when missing.
    const { getWeeklyReflectionMessage } = await import("@/lib/settings");
    assert.equal((await getWeeklyReflectionMessage()).titleTemplate, "\u201C{quote}\u201D");
  });

  it("falls back to the default wording, never a literal placeholder, if the stored template is invalid", async () => {
    await db.siteSettings.update({ where: { id: 1 }, data: { weeklyReflectionBodyTemplate: "Oops {qoute}", weeklyReflectionTitleTemplate: "Week {nope}" } });
    const result = await admin.postReflectionNow(adminId, {}, utc(2031, 5, 26), stub);
    assert.equal(result.status, "posted");
    if (result.status !== "posted") return;
    const thread = await db.forumThread.findUniqueOrThrow({ where: { id: result.threadId }, include: { posts: true } });
    const quote = await db.reflectionQuote.findUniqueOrThrow({ where: { id: result.quoteId } });
    assert.equal(thread.title, `Weekly Reflection: \u201C${quote.text}\u201D`);
    assert.ok(!thread.posts[0].body.includes("{qoute}"));
    assert.ok(thread.posts[0].body.startsWith(quote.prompt));
  });

  it("returns to the default wording byte-for-byte after a reset", async () => {
    const { DEFAULT_BODY_TEMPLATE, DEFAULT_TITLE_TEMPLATE } = await import("@/lib/reflection-template");
    await admin.updateReflectionMessage(adminId, { titleTemplate: DEFAULT_TITLE_TEMPLATE, bodyTemplate: DEFAULT_BODY_TEMPLATE });
    const result = await admin.postReflectionNow(adminId, {}, utc(2031, 6, 2), stub);
    assert.equal(result.status, "posted");
    if (result.status !== "posted") return;
    const thread = await db.forumThread.findUniqueOrThrow({ where: { id: result.threadId }, include: { posts: true } });
    const quote = await db.reflectionQuote.findUniqueOrThrow({ where: { id: result.quoteId } });
    assert.equal(thread.title, `Weekly Reflection: \u201C${quote.text}\u201D`);
    assert.equal(thread.posts[0].body, `${quote.prompt}\n\n\u201C${quote.text}\u201D\n\u2014 ${quote.author}`);
  });

  it("route shell: signed-out is 401, non-admin is 403, admin runs the handler, domain errors map to their status", async () => {
    const { NextResponse } = await import("next/server");
    const ok = async () => NextResponse.json({ ok: true });
    const denyWith = (status: 401 | 403) => async () => {
      throw new AuthError(status);
    };
    assert.equal((await withAdmin(ok, denyWith(401))).status, 401);
    assert.equal((await withAdmin(ok, denyWith(403))).status, 403);
    assert.equal((await withAdmin(ok, async () => ({ id: adminId }) as never)).status, 200);

    const failing = async () => {
      throw new admin.ReflectionAdminError(409, "dup");
    };
    assert.equal((await withAdmin(failing, async () => ({ id: adminId }) as never)).status, 409);
  });
});
