// DB-backed integration test: member opens of From the Web articles (the
// What's New row's eye-icon count) and the /from-the-web/[id]/open forward.
// Run with REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database ("scratch"/"test" in its name).
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

describe("Curated article opens (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let server: typeof import("@/lib/curated-articles-server");
  let feed: typeof import("@/lib/feed-server");
  let memberA: string;
  let memberB: string;
  let published: string;

  const row = async () =>
    (await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberA })).items.find((item) => item.id === published);

  before(async () => {
    ({ db } = await import("@/lib/db"));
    server = await import("@/lib/curated-articles-server");
    feed = await import("@/lib/feed-server");
    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await db.forum.upsert({ where: { slug: "from-the-web" }, update: { active: true }, create: { name: "From the Web", slug: "from-the-web" } });
    const mk = async (key: string) =>
      (
        await db.user.upsert({
          where: { clerkUserId: `test_opens_${key}` },
          update: {},
          create: { clerkUserId: `test_opens_${key}`, email: `opens-${key}@example.test`, name: `Opens ${key}`, role: "member" },
        })
      ).id;
    memberA = await mk("a");
    memberB = await mk("b");
    published = (
      await db.externalArticle.create({
        data: {
          url: "https://pub.example.test/story",
          linkUrl: "https://pub.example.test/story/",
          title: "Opened story",
          excerpt: "x",
          sourceName: "Pub",
          status: "approved",
          approvedAt: new Date(),
        },
      })
    ).id;
  });

  it("[AC:06da64ec:ac_1] the row links through NASIHA's open link, which forwards to the publisher's exact link", async () => {
    const r = await row();
    assert.equal(r?.href, `/from-the-web/${published}/open`);
    assert.equal(r?.article?.url, `/from-the-web/${published}/open`, "Read on… goes the same way");
    assert.equal(await server.openCuratedArticle(published, memberA), "https://pub.example.test/story/");
  });

  it("[AC:06da64ec:ac_2] [AC:06da64ec:ac_3] each member counts once; the row shows the open count", async () => {
    await server.openCuratedArticle(published, memberA);
    await server.openCuratedArticle(published, memberA);
    await server.openCuratedArticle(published, memberB);
    assert.equal(await db.externalArticleView.count({ where: { articleId: published } }), 2);
    const r = await row();
    assert.equal(r?.articleViewCount, 2);
    assert.equal(r?.forumReplyCount, undefined, "no reply count until a discussion exists");
    const { threadId } = await server.startCuratedArticleDiscussion(published, memberA);
    await db.forumPost.create({ data: { threadId, authorId: memberB, body: "Interesting" } });
    assert.equal((await row())?.forumReplyCount, 1);
  });

  it("[AC:06da64ec:ac_4] unpublished or missing articles aren't forwarded; signed-out opens aren't counted", async () => {
    const pending = await db.externalArticle.create({
      data: { url: "https://pub.example.test/pending", title: "Pending", excerpt: "x", sourceName: "Pub", status: "pending" },
    });
    assert.equal(await server.openCuratedArticle(pending.id, memberA), null);
    assert.equal(await server.openCuratedArticle("no-such-article", memberA), null);
    assert.equal(await db.externalArticleView.count({ where: { articleId: pending.id } }), 0);
    const before = await db.externalArticleView.count({ where: { articleId: published } });
    assert.equal(await server.openCuratedArticle(published, null), "https://pub.example.test/story/", "signed-out visitors are still forwarded…");
    assert.equal(await db.externalArticleView.count({ where: { articleId: published } }), before, "…but not counted");
  });
});
