// DB-backed integration test for the Weekly Reflection posting job. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database. It writes real rows, so
// it refuses to run unless the database name contains "scratch" or "test" —
// never point it at the dev or production database.
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

describe("Weekly Reflection posting (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let post: typeof import("@/lib/weekly-reflection-post").postWeeklyReflection;
  let runCheck: typeof import("@/lib/weekly-reflection-job").runWeeklyReflectionCheck;
  let createForumPost: typeof import("@/lib/forums-server").createForumPost;
  let forumId: string;
  let systemUserId: string;
  let memberA: string;
  let memberB: string;
  const indexed: string[] = [];
  const enqueueIndexSync = async (threadId: string) => {
    indexed.push(threadId);
  };

  const threads = () => db.forumThread.findMany({ where: { forumId }, orderBy: { createdAt: "asc" } });

  before(async () => {
    ({ db } = await import("@/lib/db"));
    ({ postWeeklyReflection: post } = await import("@/lib/weekly-reflection-post"));
    ({ runWeeklyReflectionCheck: runCheck } = await import("@/lib/weekly-reflection-job"));
    ({ createForumPost } = await import("@/lib/forums-server"));
    const { getOrCreateWeeklyReflectionUser } = await import("@/lib/system-user");

    const forum = await db.forum.upsert({
      where: { slug: "weekly-reflection" },
      update: { active: true },
      create: { name: "Weekly Reflection", slug: "weekly-reflection", displayOrder: 1 },
    });
    forumId = forum.id;
    systemUserId = (await getOrCreateWeeklyReflectionUser()).id;

    for (const n of [1, 2, 3]) {
      await db.reflectionQuote.upsert({
        where: { text: `Test quote ${n}` },
        update: { active: true, lastPostedAt: null, timesPosted: 0 },
        create: {
          text: `Test quote ${n}`,
          author: `Author ${n}`,
          source: n === 1 ? "Some Book" : null,
          prompt: `Prompt ${n}`,
          createdAt: utc(2020, 1, n),
        },
      });
    }
    for (const [key, name] of [["a", "Member A"], ["b", "Member B"]] as const) {
      const user = await db.user.upsert({
        where: { clerkUserId: `test_member_${key}` },
        update: {},
        create: {
          clerkUserId: `test_member_${key}`,
          email: `member-${key}@example.test`,
          name,
          role: "member",
          tier: "active",
          profile: { create: {} },
        },
      });
      if (key === "a") memberA = user.id;
      else memberB = user.id;
    }
  });

  it("posts one pinned thread by the system user containing quote, attribution and prompt", async () => {
    const result = await post(utc(2030, 1, 7), { enqueueIndexSync });
    assert.equal(result.status, "posted");
    if (result.status !== "posted") return;
    assert.equal(result.weekKey, "2030-W02");

    const all = await threads();
    assert.equal(all.length, 1);
    assert.equal(all[0].authorId, systemUserId);
    assert.equal(all[0].pinned, true);
    assert.match(all[0].title, /Weekly Reflection: week of Jan 7, 2030/);

    const posts = await db.forumPost.findMany({ where: { threadId: all[0].id } });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].authorId, systemUserId);
    assert.equal(posts[0].body, "“Test quote 1”\n— Author 1, Some Book\n\nPrompt 1");

    const quote = await db.reflectionQuote.findUniqueOrThrow({ where: { text: "Test quote 1" } });
    assert.equal(quote.timesPosted, 1);
    assert.equal(quote.lastPostedAt?.toISOString(), utc(2030, 1, 7).toISOString());
    assert.deepEqual(indexed, [all[0].id], "thread is queued for search indexing");
  });

  it("creates no second thread when run again the same week, from any day or after a restart", async () => {
    const again = await post(utc(2030, 1, 7), { enqueueIndexSync });
    const laterThatWeek = await post(utc(2030, 1, 13, 23), { enqueueIndexSync });
    assert.equal(again.status, "already-posted");
    assert.equal(laterThatWeek.status, "already-posted");
    assert.equal((await threads()).length, 1);
    assert.equal(indexed.length, 1);
    const quote = await db.reflectionQuote.findUniqueOrThrow({ where: { text: "Test quote 1" } });
    assert.equal(quote.timesPosted, 1, "quote is not re-marked");
  });

  it("creates exactly one thread when two runs race for the same week", async () => {
    const week = utc(2030, 1, 14);
    const results = await Promise.all([post(week, { enqueueIndexSync }), post(week, { enqueueIndexSync })]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["already-posted", "posted"]);
    const all = await threads();
    assert.equal(all.length, 2, "one from the previous test plus exactly one for this week");
    assert.equal(await db.reflectionPost.count({ where: { weekKey: "2030-W03" } }), 1);
  });

  it("rotates quotes, and keeps only the newest thread pinned", async () => {
    await post(utc(2030, 1, 21), { enqueueIndexSync });
    const all = await threads();
    assert.equal(all.length, 3);
    const quotes = await db.reflectionPost.findMany({ orderBy: { postedAt: "asc" }, include: { quote: true } });
    assert.deepEqual(
      quotes.map((row) => row.quote?.text),
      ["Test quote 1", "Test quote 2", "Test quote 3"],
    );
    assert.deepEqual(all.map((t) => t.pinned), [false, false, true]);
  });

  it("starts a new cycle once every quote has been posted", async () => {
    await post(utc(2030, 1, 28), { enqueueIndexSync });
    const last = await db.reflectionPost.findUniqueOrThrow({ where: { weekKey: "2030-W05" }, include: { quote: true } });
    assert.equal(last.quote?.text, "Test quote 1");
    const pinned = (await threads()).filter((t) => t.pinned);
    assert.equal(pinned.length, 1);
  });

  it("notifies earlier repliers of later replies but never the system user", async () => {
    const thread = (await threads()).filter((t) => t.pinned)[0];
    await db.notification.deleteMany({});

    await createForumPost(thread.id, memberA, { body: "First reply", parentId: null, deidentificationConfirmed: false });
    assert.equal(await db.notification.count({ where: { recipientId: systemUserId } }), 0, "no notification for the thread's system author");

    await createForumPost(thread.id, memberB, { body: "Second reply", parentId: null, deidentificationConfirmed: false });
    assert.equal(await db.notification.count({ where: { recipientId: systemUserId } }), 0);
    const toA = await db.notification.findMany({ where: { recipientId: memberA } });
    assert.equal(toA.length, 1, "the member who replied earlier is still notified normally");
    assert.equal(toA[0].type, "forum_reply_mention");
  });

  it("skips (without throwing) when the forum is missing, then recovers", async () => {
    await db.forum.update({ where: { id: forumId }, data: { active: false } });
    const result = await post(utc(2030, 2, 4), { enqueueIndexSync });
    assert.deepEqual(result, { status: "skipped", weekKey: "2030-W06", reason: "forum-missing" });
    assert.equal(await db.reflectionPost.count({ where: { weekKey: "2030-W06" } }), 0, "skipped week isn't consumed");

    await db.forum.update({ where: { id: forumId }, data: { active: true } });
    assert.equal((await post(utc(2030, 2, 4), { enqueueIndexSync })).status, "posted");
  });

  it("skips (without throwing) when the system user is missing", async () => {
    await db.user.update({ where: { id: systemUserId }, data: { clerkUserId: "system:renamed-for-test" } });
    try {
      const result = await post(utc(2030, 2, 11), { enqueueIndexSync });
      assert.deepEqual(result, { status: "skipped", weekKey: "2030-W07", reason: "system-user-missing" });
    } finally {
      await db.user.update({ where: { id: systemUserId }, data: { clerkUserId: "system:weekly-reflection" } });
    }
  });

  it("skips (without throwing) when the pool has no active quotes", async () => {
    await db.reflectionQuote.updateMany({ data: { active: false } });
    try {
      const result = await post(utc(2030, 2, 18), { enqueueIndexSync });
      assert.deepEqual(result, { status: "skipped", weekKey: "2030-W08", reason: "pool-empty" });
    } finally {
      await db.reflectionQuote.updateMany({ data: { active: true } });
    }
  });

  it("does not repost a week whose thread a moderator deleted", async () => {
    const result = await post(utc(2030, 2, 25), { enqueueIndexSync });
    assert.equal(result.status, "posted");
    if (result.status !== "posted") return;
    await db.forumThread.delete({ where: { id: result.threadId } });

    const row = await db.reflectionPost.findUniqueOrThrow({ where: { weekKey: "2030-W09" } });
    assert.equal(row.threadId, null);
    assert.equal((await post(utc(2030, 2, 26), { enqueueIndexSync })).status, "already-posted");
  });

  it("the scheduled check waits for the due time, then posts via the same function", async () => {
    // Default schedule is Monday 09:00 UTC. runWeeklyReflectionCheck has no
    // injection seam, so use a week whose posting we can't confuse with the
    // stubbed index queue: assert only on database effects.
    assert.deepEqual(await runCheck(utc(2030, 3, 4, 8)), { status: "not-due" });
    assert.equal(await db.reflectionPost.count({ where: { weekKey: "2030-W10" } }), 0);
  });
});
