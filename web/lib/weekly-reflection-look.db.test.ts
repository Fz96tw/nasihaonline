// DB-backed test for the Weekly Reflection image look: the image rotation and
// quote snapshot stored on each post, and the data the feed row and thread page
// get. Same safety rules as the other .db.test.ts files (scratch/test DB only).
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

describe("Weekly Reflection image look (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let post: typeof import("@/lib/weekly-reflection-post").postWeeklyReflection;
  let getFeedPage: typeof import("@/lib/feed-server").getFeedPage;
  let getForumThreadDetail: typeof import("@/lib/forums-server").getForumThreadDetail;
  let createForumPost: typeof import("@/lib/forums-server").createForumPost;
  let viewerId: string;
  const files = ["sky.jpg", "water.png", "README.md", ".gitkeep"];
  const options = (listImages: () => Promise<string[]> = async () => files) => ({ enqueueIndexSync: async () => {}, listImages });

  const reflectionPost = (weekKey: string) => db.reflectionPost.findUniqueOrThrow({ where: { weekKey } });

  before(async () => {
    ({ db } = await import("@/lib/db"));
    ({ postWeeklyReflection: post } = await import("@/lib/weekly-reflection-post"));
    ({ getFeedPage } = await import("@/lib/feed-server"));
    ({ getForumThreadDetail, createForumPost } = await import("@/lib/forums-server"));
    const { getOrCreateWeeklyReflectionUser } = await import("@/lib/system-user");

    await db.forum.upsert({
      where: { slug: "weekly-reflection" },
      update: { active: true },
      create: { name: "Weekly Reflection", slug: "weekly-reflection", displayOrder: 1 },
    });
    await getOrCreateWeeklyReflectionUser();
    await db.reflectionPost.deleteMany({});
    await db.forumThread.deleteMany({});
    await db.reflectionQuote.deleteMany({});
    await db.siteSettings.deleteMany({});
    await db.reflectionQuote.create({
      data: { text: "Look quote one", author: "Author A", source: "Some Book", prompt: "Prompt A", createdAt: utc(2020, 1, 1) },
    });
    await db.reflectionQuote.create({
      data: { text: "Look quote two", author: "Author B", prompt: "Prompt B", createdAt: utc(2020, 1, 2) },
    });
    viewerId = (
      await db.user.upsert({
        where: { clerkUserId: "test_look_viewer" },
        update: {},
        create: { clerkUserId: "test_look_viewer", email: "look@example.test", name: "Viewer", role: "member", tier: "active", profile: { create: {} } },
      })
    ).id;
  });

  it("records the chosen image and a snapshot of the quote and attribution on the post", async () => {
    const result = await post(utc(2032, 1, 5), options());
    assert.equal(result.status, "posted");
    const row = await reflectionPost("2032-W02");
    assert.equal(row.imageFile, "sky.jpg", "README.md and .gitkeep are never chosen");
    assert.equal(row.quoteText, "Look quote one");
    assert.equal(row.quoteAttribution, "Author A, Some Book");
  });

  it("rotates images: the least recently used comes next and consecutive posts differ", async () => {
    await post(utc(2032, 1, 12), options());
    await post(utc(2032, 1, 19), options());
    assert.equal((await reflectionPost("2032-W03")).imageFile, "water.png");
    assert.equal((await reflectionPost("2032-W04")).imageFile, "sky.jpg", "a new cycle starts once every image has been used");
  });

  it("still posts, on the gradient look, when the folder has no images", async () => {
    const result = await post(utc(2032, 1, 26), options(async () => ["README.md"]));
    assert.equal(result.status, "posted");
    const row = await reflectionPost("2032-W05");
    assert.equal(row.imageFile, null);
    assert.ok(row.quoteText, "the quote snapshot is still stored");
  });

  it("does not change an existing post's look when the pool quote is edited or retired", async () => {
    const before = await reflectionPost("2032-W02");
    const quote = await db.reflectionQuote.findUniqueOrThrow({ where: { text: "Look quote one" } });
    await db.reflectionQuote.update({ where: { id: quote.id }, data: { text: "Look quote one (edited)", author: "Someone Else", active: false } });
    const after = await reflectionPost("2032-W02");
    assert.equal(after.quoteText, before.quoteText);
    assert.equal(after.quoteAttribution, before.quoteAttribution);
    assert.equal(after.imageFile, before.imageFile);
    await db.reflectionQuote.update({ where: { id: quote.id }, data: { text: "Look quote one", author: "Author A", active: true } });
  });

  it("gives the feed an image card on the thread's own row only, with the quote snapshot", async () => {
    const row = await reflectionPost("2032-W02");
    // A plain, non-reflection thread in another forum must stay a normal row.
    const general = await db.forum.upsert({ where: { slug: "general" }, update: {}, create: { name: "General", slug: "general" } });
    const plain = await db.forumThread.create({
      data: { forumId: general.id, authorId: viewerId, title: "A plain thread", posts: { create: { authorId: viewerId, body: "Hello" } } },
    });
    // A reply bumps the reflection thread, which can add a reply row for it.
    await createForumPost(row.threadId!, viewerId, { body: "My reflection", parentId: null, deidentificationConfirmed: false });

    const page = await getFeedPage({ cursor: null, types: ["forum_thread"], viewerId, viewerRole: "member", pageSize: 50 });
    const reflectionRows = page.items.filter((item) => item.href.includes(row.threadId!));
    assert.ok(reflectionRows.length >= 1);
    for (const item of reflectionRows) {
      if (item.isReply) assert.equal(item.reflectionCard, undefined, "reply rows keep the normal layout");
    }
    const opening = reflectionRows.find((item) => !item.isReply);
    assert.ok(opening, "the opening row is present");
    assert.deepEqual(opening.reflectionCard, {
      imageUrl: "/images/weeklyreflection/sky.jpg",
      quote: "Look quote one",
      attribution: "Author A, Some Book",
    });

    const plainRow = page.items.find((item) => item.href.includes(plain.id));
    assert.ok(plainRow, "the plain thread is in the feed too");
    assert.equal(plainRow.reflectionCard, undefined);
  });

  it("gives the thread page a hero (image or gradient) only for reflection threads", async () => {
    const withImage = await reflectionPost("2032-W02");
    const detail = await getForumThreadDetail("weekly-reflection", withImage.threadId!, viewerId, false);
    assert.deepEqual(detail?.reflection, {
      imageUrl: "/images/weeklyreflection/sky.jpg",
      quote: "Look quote one",
      attribution: "Author A, Some Book",
    });

    const noImage = await reflectionPost("2032-W05");
    const gradient = await getForumThreadDetail("weekly-reflection", noImage.threadId!, viewerId, false);
    assert.equal(gradient?.reflection?.imageUrl, null);
    assert.ok(gradient?.reflection?.quote);

    const plain = await db.forumThread.findFirstOrThrow({ where: { title: "A plain thread" } });
    const plainDetail = await getForumThreadDetail("general", plain.id, viewerId, false);
    assert.equal(plainDetail?.reflection, null);
  });

  it("URL-encodes an image file name with spaces", async () => {
    const result = await post(utc(2032, 2, 2), options(async () => ["my sky #1.jpg"]));
    assert.equal(result.status, "posted");
    const row = await reflectionPost("2032-W06");
    assert.equal(row.imageFile, "my sky #1.jpg");
    const detail = await getForumThreadDetail("weekly-reflection", row.threadId!, viewerId, false);
    assert.equal(detail?.reflection?.imageUrl, "/images/weeklyreflection/my%20sky%20%231.jpg");
  });
});
