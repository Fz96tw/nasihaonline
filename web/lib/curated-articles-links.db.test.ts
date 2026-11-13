// DB-backed integration test: curated articles link members to the
// publisher's own URL (ExternalArticle.linkUrl), while the normalized `url`
// stays the dedupe key. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database ("scratch"/"test" in its
// name). No network access: an injected transport serves feeds and pages.
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

describe("Curated article publisher links (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let fetchMod: typeof import("@/lib/curated-article-fetch");
  let server: typeof import("@/lib/curated-articles-server");
  let feed: typeof import("@/lib/feed-server");
  let adminId: string;
  let memberId: string;
  const web = new Map<string, string>();
  const get: import("@/lib/curated-article-fetch").HttpGet = async (target) => {
    const body = web.get(target);
    if (body === undefined) throw new fetchMod.ArticleFetchError(`HTTP 404 from ${new URL(target).hostname}.`);
    return { status: 200, url: target, headers: new Headers({ "content-type": "text/html" }), body: Buffer.from(body) };
  };
  const rss = (link: string) =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Why AI needs a separation of powers</title><link>${link}</link><description>Teaser.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;

  before(async () => {
    ({ db } = await import("@/lib/db"));
    fetchMod = await import("@/lib/curated-article-fetch");
    server = await import("@/lib/curated-articles-server");
    feed = await import("@/lib/feed-server");
    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await db.articleSource.deleteMany({});
    await db.forum.upsert({
      where: { slug: "from-the-web" },
      update: { active: true },
      create: { name: "From the Web", slug: "from-the-web", displayOrder: 9 },
    });
    const mk = async (key: string, role: "admin" | "member") =>
      (
        await db.user.upsert({
          where: { clerkUserId: `test_links_${key}` },
          update: { role },
          create: { clerkUserId: `test_links_${key}`, email: `links-${key}@example.test`, name: `Links ${key}`, role },
        })
      ).id;
    adminId = await mk("admin", "admin");
    memberId = await mk("member", "member");
  });

  it("[AC:7d211c48:ac_1] [AC:7d211c48:ac_3] a fetched article keeps the publisher's link; slash/tracking variants still dedupe", async () => {
    await db.articleSource.create({ data: { name: "Wharton-ish", url: "https://feeds.example.test/a" } });
    await db.articleSource.create({ data: { name: "Mirror", url: "https://feeds.example.test/b" } });
    web.set("https://feeds.example.test/a", rss("https://pub.example.test/article/why-ai/?utm_source=rss&amp;utm_medium=feed"));
    web.set("https://feeds.example.test/b", rss("https://pub.example.test/article/why-ai"));
    web.set("https://pub.example.test/article/why-ai", "<html><head></head><body></body></html>");
    const result = await fetchMod.runCuratedArticleFetch({ force: true, get });
    assert.equal(result.status === "ran" && result.newCount, 1, "stored once");
    const article = await db.externalArticle.findFirstOrThrow();
    assert.equal(article.url, "https://pub.example.test/article/why-ai", "dedupe key is the normalized form");
    assert.ok(
      ["https://pub.example.test/article/why-ai/", "https://pub.example.test/article/why-ai"].includes(article.linkUrl ?? ""),
      "the link is one of the publisher's own forms",
    );
    // Whichever feed won the race, the slash form came from feed A — check that path explicitly.
    await db.externalArticle.deleteMany({});
    await db.articleSource.deleteMany({ where: { name: "Mirror" } });
    await db.articleSource.updateMany({ data: { etag: null, lastModified: null } });
    await fetchMod.runCuratedArticleFetch({ force: true, get });
    const fromA = await db.externalArticle.findFirstOrThrow();
    assert.equal(fromA.linkUrl, "https://pub.example.test/article/why-ai/", "trailing slash kept, tracking parameters removed");
  });

  it("[AC:7d211c48:ac_2] the feed row, Read on link, admin card and discussion all use the publisher's link", async () => {
    const article = await db.externalArticle.findFirstOrThrow();
    const dto = await server.setCuratedArticleStatus(article.id, adminId, "approved", { postNow: true });
    assert.equal(dto.url, "https://pub.example.test/article/why-ai/", "admin card link");
    const row = (await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberId })).items.find((i) => i.id === article.id);
    assert.equal(row?.href, `/from-the-web/${article.id}/open`);
    assert.equal(row?.article?.url, `/from-the-web/${article.id}/open`, "Read on… link");
    assert.equal(await server.openCuratedArticle(article.id, memberId), "https://pub.example.test/article/why-ai/", "forwards to the publisher's exact link");
    const { threadId } = await server.startCuratedArticleDiscussion(article.id, memberId);
    const opening = await db.forumPost.findFirstOrThrow({ where: { threadId }, orderBy: { createdAt: "asc" } });
    assert.match(opening.body, /https:\/\/pub\.example\.test\/article\/why-ai\//);
  });

  it("[AC:7d211c48:ac_2] older articles without a stored publisher link fall back to their URL", async () => {
    const legacy = await db.externalArticle.create({
      data: { url: "https://old.example.test/story", title: "Legacy", excerpt: "x", sourceName: "Old", status: "approved", approvedAt: new Date() },
    });
    const row = (await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberId })).items.find((i) => i.id === legacy.id);
    assert.equal(row?.href, `/from-the-web/${legacy.id}/open`);
    assert.equal(await server.openCuratedArticle(legacy.id, memberId), "https://old.example.test/story", "older rows forward to their URL");
  });

  it("[AC:7d211c48:ac_1] an article added by link keeps the page's canonical link as published", async () => {
    web.set(
      "https://blog.example.test/post",
      `<html><head><meta property="og:title" content="Teens tutor neighbors"><link rel="canonical" href="https://blog.example.test/post/"></head></html>`,
    );
    const dto = await server.addCuratedArticleByUrl(adminId, { url: "https://blog.example.test/post?utm_campaign=x", communityIds: [] }, { get });
    const row = await db.externalArticle.findUniqueOrThrow({ where: { id: dto.id } });
    assert.equal(row.url, "https://blog.example.test/post");
    assert.equal(row.linkUrl, "https://blog.example.test/post/");
  });
});
