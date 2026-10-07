// DB-backed test for the admin "Replace this week's" option on Post now. Same
// safety rules as the other .db.test.ts files (scratch/test DB only).
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

describe("Weekly Reflection: replace this week's (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let admin: typeof import("@/lib/weekly-reflection-admin");
  let getFeedPage: typeof import("@/lib/feed-server").getFeedPage;
  let getForumBySlug: typeof import("@/lib/forums-server").getForumBySlug;
  let getForumThreadDetail: typeof import("@/lib/forums-server").getForumThreadDetail;
  let createForumPost: typeof import("@/lib/forums-server").createForumPost;
  let adminId: string;
  let memberId: string;
  const indexed: string[] = [];
  const stub = { enqueueIndexSync: async (id: string) => void indexed.push(id), listImages: async () => [] as string[] };

  const postedId = (result: Awaited<ReturnType<typeof admin.postReflectionNow>>) => {
    assert.equal(result.status, "posted");
    return result.status === "posted" ? result.threadId : "";
  };
  const thread = (id: string) => db.forumThread.findUniqueOrThrow({ where: { id } });
  const feedHrefs = async () =>
    (await getFeedPage({ cursor: null, types: ["forum_thread"], viewerId: memberId, viewerRole: "member", pageSize: 50 })).items.map((item) => item.href);
  const audit = (action: string) => db.adminActionLog.findMany({ where: { action }, orderBy: { createdAt: "asc" } });

  before(async () => {
    ({ db } = await import("@/lib/db"));
    admin = await import("@/lib/weekly-reflection-admin");
    ({ getFeedPage } = await import("@/lib/feed-server"));
    ({ getForumBySlug, getForumThreadDetail, createForumPost } = await import("@/lib/forums-server"));
    const { getOrCreateWeeklyReflectionUser } = await import("@/lib/system-user");

    await db.forum.upsert({
      where: { slug: "weekly-reflection" },
      update: { active: true },
      create: { name: "Weekly Reflection", slug: "weekly-reflection", displayOrder: 1 },
    });
    await getOrCreateWeeklyReflectionUser();
    await db.adminActionLog.deleteMany({});
    await db.reflectionPost.deleteMany({});
    await db.forumThread.deleteMany({});
    await db.reflectionQuote.deleteMany({});
    await db.siteSettings.deleteMany({});
    for (let n = 1; n <= 8; n++) {
      await db.reflectionQuote.create({ data: { text: `Replace quote ${n}`, author: `Author ${n}`, prompt: `Prompt ${n}`, createdAt: utc(2020, 1, n) } });
    }
    adminId = (
      await db.user.upsert({
        where: { clerkUserId: "test_rep_admin" },
        update: {},
        create: { clerkUserId: "test_rep_admin", email: "rep-admin@example.test", name: "Admin", role: "admin", tier: "active", profile: { create: {} } },
      })
    ).id;
    memberId = (
      await db.user.upsert({
        where: { clerkUserId: "test_rep_member" },
        update: {},
        create: { clerkUserId: "test_rep_member", email: "rep-member@example.test", name: "Member", role: "member", tier: "active", profile: { create: {} } },
      })
    ).id;
  });

  it("replace hides the earlier thread from the forum list, the feed and direct access, queues its search removal, and pins the new one", async () => {
    const week = utc(2033, 3, 2);
    const first = postedId(await admin.postReflectionNow(adminId, {}, week, stub));
    assert.ok((await feedHrefs()).some((href) => href.includes(first)), "the first thread is in the feed");

    indexed.length = 0;
    const result = await admin.postReflectionNow(adminId, { replace: true }, week, stub);
    const second = postedId(result);
    assert.equal(result.status === "posted" ? result.replacedThreadId : null, first);

    const old = await thread(first);
    assert.equal(old.removed, true);
    assert.equal(old.pinned, false, "the replaced thread is not pinned");
    const fresh = await thread(second);
    assert.equal(fresh.removed, false);
    assert.equal(fresh.pinned, true, "the new thread is pinned");

    const hrefs = await feedHrefs();
    assert.ok(!hrefs.some((href) => href.includes(first)), "gone from the What's New feed");
    assert.ok(hrefs.some((href) => href.includes(second)), "the new one is in the feed");

    const forum = await getForumBySlug("weekly-reflection", memberId, false);
    assert.ok(forum && !forum.threads.some((t) => t.id === first), "gone from the forum list");
    assert.ok(forum?.threads.some((t) => t.id === second));
    assert.equal(await getForumThreadDetail("weekly-reflection", first, memberId, false), null, "no direct access for a member");
    assert.equal(await getForumThreadDetail("weekly-reflection", first, adminId, true), null, "none even for an admin");

    assert.ok(indexed.includes(first), "the replaced thread is queued so search drops it");
    assert.ok(indexed.includes(second), "the new thread is queued for indexing");

    assert.equal(await db.reflectionPost.count({ where: { threadId: first } }), 1, "the replaced thread's record stays (week and quote stay consumed)");
  });

  it("records the replace in the audit log with the acting admin and both thread ids", async () => {
    const rows = await audit("weekly_reflection.replaced");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actorId, adminId);
    const meta = rows[0].metadata as { replacedThreadId?: string; newThreadId?: string };
    assert.ok(meta.replacedThreadId && meta.newThreadId && meta.replacedThreadId !== meta.newThreadId);
    assert.equal(rows[0].entityId, meta.newThreadId);
  });

  it("refuses to replace once a member has replied, posting and hiding nothing", async () => {
    const week = utc(2033, 3, 9);
    const first = postedId(await admin.postReflectionNow(adminId, {}, week, stub));
    await createForumPost(first, memberId, { body: "My reflection", parentId: null, deidentificationConfirmed: false });

    const before = await db.reflectionPost.count();
    const result = await admin.postReflectionNow(adminId, { replace: true }, week, stub);
    assert.equal(result.status, "replace-blocked");
    assert.equal(result.status === "replace-blocked" ? result.replyCount : -1, 1);
    assert.equal(await db.reflectionPost.count(), before, "nothing was posted");
    assert.equal((await thread(first)).removed, false, "the earlier thread is untouched");
    assert.equal((await thread(first)).pinned, true);
  });

  it("tells the UI the current thread and its reply count when this week is already posted", async () => {
    const week = utc(2033, 3, 9); // the week from the previous test: one reply
    const again = await admin.postReflectionNow(adminId, {}, week, stub);
    assert.equal(again.status, "already-posted");
    assert.equal(again.status === "already-posted" ? again.current?.replyCount : -1, 1);

    const fresh = utc(2033, 3, 16);
    const id = postedId(await admin.postReflectionNow(adminId, {}, fresh, stub));
    const noReplies = await admin.postReflectionNow(adminId, {}, fresh, stub);
    assert.equal(noReplies.status === "already-posted" ? noReplies.current?.replyCount : -1, 0);
    assert.equal(noReplies.status === "already-posted" ? noReplies.current?.threadId : "", id);
  });

  it("add another still keeps both threads, unpins the earlier and pins the newest", async () => {
    const week = utc(2033, 3, 23);
    const first = postedId(await admin.postReflectionNow(adminId, {}, week, stub));
    const second = postedId(await admin.postReflectionNow(adminId, { override: true }, week, stub));
    assert.equal((await thread(first)).removed, false);
    assert.equal((await thread(first)).pinned, false);
    assert.equal((await thread(second)).pinned, true);
    assert.equal((await audit("weekly_reflection.posted_now")).length >= 1, true);
  });

  it("replace with no reflection yet this week simply posts", async () => {
    const result = await admin.postReflectionNow(adminId, { replace: true }, utc(2033, 3, 30), stub);
    assert.equal(result.status, "posted");
    assert.equal(result.status === "posted" ? result.replacedThreadId : "x", undefined);
  });

  it("two concurrent replaces leave exactly one live thread and never lose the week", async () => {
    const week = utc(2033, 4, 6);
    const first = postedId(await admin.postReflectionNow(adminId, {}, week, stub));
    const results = await Promise.all([
      admin.postReflectionNow(adminId, { replace: true }, week, stub),
      admin.postReflectionNow(adminId, { replace: true }, week, stub),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["already-posted", "posted"]);

    const rows = await db.reflectionPost.findMany({
      where: { OR: [{ weekKey: "2033-W14" }, { weekKey: { startsWith: "2033-W14-extra-" } }] },
      include: { thread: true },
    });
    const live = rows.filter((row) => row.thread && !row.thread.removed);
    assert.equal(live.length, 1, "exactly one live thread for the week");
    assert.equal((await thread(first)).removed, true, "the original was replaced");
  });

  it("the dialog's data check: only the current live thread of the week counts", async () => {
    const week = utc(2033, 4, 13);
    const first = postedId(await admin.postReflectionNow(adminId, {}, week, stub));
    await db.forumThread.update({ where: { id: first }, data: { removed: true } }); // e.g. a moderator removed it
    assert.equal(await admin.getCurrentReflectionThread(week), null);
    const result = await admin.postReflectionNow(adminId, { replace: true }, week, stub);
    assert.equal(result.status, "posted", "with nothing live to replace, a new one is posted");
  });
});
