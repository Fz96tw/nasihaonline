// DB-backed integration test for curated "From the Web" articles. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database. It writes real rows, so
// it refuses to run unless the database name contains "scratch" or "test" —
// never point it at the dev or production database. No network access: feeds
// and pages are served by an injected HTTP transport.
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

const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 864e5).toUTCString();

function rss(items: { title: string; link: string; description?: string; pubDate?: string }[]): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Fake feed</title><link>https://feeds.example.test/</link>${items
    .map(
      (item) =>
        `<item><title>${item.title}</title><link>${item.link}</link>${item.description ? `<description>${item.description}</description>` : ""}${
          item.pubDate ? `<pubDate>${item.pubDate}</pubDate>` : ""
        }</item>`,
    )
    .join("")}</channel></rss>`;
}

describe("Curated articles (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let fetchMod: typeof import("@/lib/curated-article-fetch");
  let server: typeof import("@/lib/curated-articles-server");
  let feed: typeof import("@/lib/feed-server");
  let forums: typeof import("@/lib/forums-server");
  let route: typeof import("@/lib/curated-articles-route");
  let adminId: string;
  let memberId: string;
  let communityId: string;
  /** Requests the fake transport saw, in order. */
  const requested: string[] = [];
  /** url → response body (string) or an Error to throw. Unknown URLs 404. */
  const web = new Map<string, string | Error>();

  const get: import("@/lib/curated-article-fetch").HttpGet = async (target) => {
    requested.push(target);
    const body = web.get(target);
    if (body instanceof Error) throw body;
    if (body === undefined) throw new Error(`HTTP 404 from ${new URL(target).hostname}.`);
    return { status: 200, url: target, headers: new Headers({ "content-type": "text/html" }), body: Buffer.from(body) };
  };

  before(async () => {
    ({ db } = await import("@/lib/db"));
    fetchMod = await import("@/lib/curated-article-fetch");
    server = await import("@/lib/curated-articles-server");
    feed = await import("@/lib/feed-server");
    forums = await import("@/lib/forums-server");
    route = await import("@/lib/curated-articles-route");

    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await db.articleSource.deleteMany({});
    await db.forum.upsert({
      where: { slug: "from-the-web" },
      update: { active: true },
      create: { name: "From the Web", slug: "from-the-web", displayOrder: 9 },
    });
    const community = await db.community.upsert({
      where: { slug: "curated-test-community" },
      update: {},
      create: { name: "Curated Test Community", slug: "curated-test-community" },
    });
    communityId = community.id;
    const mk = async (key: string, role: "admin" | "member") =>
      (
        await db.user.upsert({
          where: { clerkUserId: `test_curated_${key}` },
          update: { role },
          create: { clerkUserId: `test_curated_${key}`, email: `curated-${key}@example.test`, name: `Curated ${key}`, role },
        })
      ).id;
    adminId = await mk("admin", "admin");
    memberId = await mk("member", "member");
  });

  it("[AC:dfdf223a:ac_1] admins create, edit, disable/enable and delete sources with keywords and community tags", async () => {
    const { id } = await server.createArticleSource(adminId, {
      name: "Temp source",
      kind: "rss",
      url: "https://temp.example.test/feed",
      includeKeywords: ["Volunteer", " volunteer ", "Students"],
      excludeKeywords: ["Mice"],
      enabled: true,
      communityIds: [communityId],
    });
    let row = await db.articleSource.findUniqueOrThrow({ where: { id }, include: { communities: true } });
    assert.deepEqual(row.includeKeywords, ["volunteer", "students"], "keywords are lowercased and de-duplicated");
    assert.deepEqual(row.excludeKeywords, ["mice"]);
    assert.deepEqual(row.communities.map((c) => c.communityId), [communityId]);

    await server.updateArticleSource(id, adminId, {
      name: "Renamed",
      kind: "news_search",
      url: "students community project",
      includeKeywords: [],
      excludeKeywords: [],
      enabled: true,
      communityIds: [],
    });
    row = await db.articleSource.findUniqueOrThrow({ where: { id }, include: { communities: true } });
    assert.equal(row.name, "Renamed");
    assert.equal(row.kind, "news_search");
    assert.equal(row.communities.length, 0);

    await server.setArticleSourceEnabled(id, adminId, false);
    assert.equal((await db.articleSource.findUniqueOrThrow({ where: { id } })).enabled, false);
    await server.setArticleSourceEnabled(id, adminId, true);
    assert.equal((await db.articleSource.findUniqueOrThrow({ where: { id } })).enabled, true);

    const listed = await server.listArticleSources();
    assert.ok(listed.some((source) => source.id === id && source.name === "Renamed"));

    await server.deleteArticleSource(id, adminId);
    assert.equal(await db.articleSource.count({ where: { id } }), 0);
    const actions = await db.adminActionLog.findMany({ where: { entityType: "ArticleSource", entityId: id }, select: { action: true } });
    assert.ok(actions.some((a) => a.action === "curated_articles.source_created"));
    assert.ok(actions.some((a) => a.action === "curated_articles.source_deleted"));
  });

  it("[AC:dfdf223a:ac_3] [AC:dfdf223a:ac_4] [AC:dfdf223a:ac_5] a run fetches enabled sources, dedupes, filters, queues pending, fills previews, and isolates failures", async () => {
    const good = await db.articleSource.create({
      data: {
        name: "Good Feed",
        url: "https://good.example.test/feed",
        includeKeywords: ["students", "volunteers"],
        excludeKeywords: ["mice"],
        communities: { create: [{ communityId }] },
      },
    });
    const broken = await db.articleSource.create({ data: { name: "Broken Feed", url: "https://broken.example.test/feed" } });
    const disabled = await db.articleSource.create({ data: { name: "Disabled Feed", url: "https://disabled.example.test/feed", enabled: false } });
    // Same story as Good Feed's first item, with tracking params — must dedupe.
    const second = await db.articleSource.create({ data: { name: "Second Feed", url: "https://second.example.test/feed" } });

    web.set(
      "https://good.example.test/feed",
      rss([
        { title: "Students plant 500 trees", link: "https://news.example.test/trees", description: "A school project.", pubDate: daysAgo(1) },
        { title: "Volunteers rebuild a library", link: "https://news.example.test/library", pubDate: daysAgo(2) },
        { title: "Study in mice: students", link: "https://news.example.test/mice", description: "Excluded.", pubDate: daysAgo(1) },
        { title: "Unrelated market news", link: "https://news.example.test/markets", pubDate: daysAgo(1) },
        { title: "Students' old story", link: "https://news.example.test/old", pubDate: daysAgo(90) },
      ]),
    );
    web.set("https://broken.example.test/feed", new Error("HTTP 500 from broken.example.test."));
    web.set("https://second.example.test/feed", rss([{ title: "Students plant 500 trees", link: "https://news.example.test/trees?utm_source=rss#top", pubDate: daysAgo(1) }]));
    // Link-preview page for the entry that had no summary (and no image).
    web.set(
      "https://news.example.test/library",
      `<html><head><meta property="og:description" content="The whole town pitched in."><meta property="og:image" content="https://img.example.test/lib.jpg"></head><body><p>FULL ARTICLE TEXT</p></body></html>`,
    );
    web.set("https://news.example.test/trees", `<html><head><meta property="og:image" content="https://img.example.test/trees.jpg"></head></html>`);

    const result = await fetchMod.runCuratedArticleFetch({ force: true, get, now: NOW });
    assert.equal(result.status, "ran");
    if (result.status !== "ran") return;
    const byName = new Map(result.sources.map((s) => [s.name, s]));
    assert.equal(byName.get("Broken Feed")?.status, "error", "the broken source failed…");
    assert.equal(byName.get("Good Feed")?.status, "ok", "…without stopping the others");
    assert.equal(byName.get("Second Feed")?.status, "ok");
    assert.ok(!byName.has("Disabled Feed"), "disabled sources aren't fetched");
    assert.ok(!requested.includes("https://disabled.example.test/feed"));

    const articles = await db.externalArticle.findMany({ orderBy: { title: "asc" }, include: { communities: true } });
    assert.deepEqual(
      articles.map((a) => a.title),
      ["Students plant 500 trees", "Volunteers rebuild a library"],
      "keyword include/exclude rules, the age cutoff, and URL dedupe across sources all applied",
    );
    for (const article of articles) {
      assert.equal(article.status, "pending");
      assert.equal(article.sourceId, good.id);
      assert.equal(article.sourceName, "Good Feed");
      assert.deepEqual(article.communities.map((c) => c.communityId), [communityId], "the source's community tags carry over");
    }
    const library = articles.find((a) => a.title.startsWith("Volunteers"))!;
    assert.equal(library.excerpt, "The whole town pitched in.", "missing summary filled from og:description");
    assert.ok(!JSON.stringify(articles).includes("FULL ARTICLE TEXT"), "the page body is never stored");
    assert.ok(requested.includes("https://img.example.test/lib.jpg"), "the og:image was fetched for caching");

    const brokenRow = await db.articleSource.findUniqueOrThrow({ where: { id: broken.id } });
    assert.match(brokenRow.lastError ?? "", /HTTP 500/);
    assert.equal(brokenRow.consecutiveFailures, 1);
    const goodRow = await db.articleSource.findUniqueOrThrow({ where: { id: good.id } });
    assert.equal(goodRow.lastError, null);
    assert.equal(goodRow.lastNewCount, 2);

    // A second run adds nothing new: the same entries are already stored.
    const again = await fetchMod.runCuratedArticleFetch({ force: true, get, now: NOW });
    assert.equal(again.status === "ran" && again.newCount, 0);
    assert.equal(await db.externalArticle.count(), 2);
    assert.equal((await db.articleSource.findUniqueOrThrow({ where: { id: broken.id } })).consecutiveFailures, 2);

    // Scheduled runs honor the site-wide switch (off by default).
    assert.deepEqual(await fetchMod.runCuratedArticleFetch({ get, now: NOW }), { status: "disabled" });

    await db.articleSource.deleteMany({ where: { id: { in: [broken.id, disabled.id, second.id] } } });
  });

  it("[AC:dfdf223a:ac_6] [AC:dfdf223a:ac_7] admins edit and approve/reject; only approved articles reach What's New, as link-out rows", async () => {
    const [trees, library] = await db.externalArticle.findMany({ orderBy: { title: "asc" } });
    const edited = await server.updateCuratedArticle(trees.id, adminId, {
      title: "Students plant 500 trees in a weekend",
      excerpt: "Admin-written blurb.",
      communityIds: [],
    });
    assert.equal(edited.title, "Students plant 500 trees in a weekend");
    assert.equal(edited.excerpt, "Admin-written blurb.");
    assert.deepEqual(edited.communityIds, []);

    const feedIds = async () =>
      (await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberId })).items.map((item) => item.id);
    assert.deepEqual(await feedIds(), [], "pending articles never appear");

    await server.setCuratedArticleStatus(trees.id, adminId, "approved", { postNow: true });
    await server.setCuratedArticleStatus(library.id, adminId, "rejected");
    const page = await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberId });
    assert.deepEqual(page.items.map((item) => item.id), [trees.id], "rejected articles never appear");
    const row = page.items[0];
    assert.equal(row.type, "article");
    assert.equal(row.href, `/from-the-web/${trees.id}/open`, "the row links out via NASIHA's open link…");
    assert.equal(await server.openCuratedArticle(trees.id, memberId), "https://news.example.test/trees", "…which forwards to the original article");
    assert.equal(row.article?.sourceName, "Good Feed");
    assert.equal(row.article?.threadHref, null, "no discussion until someone starts one");
    assert.ok(row.imageUrl, "always has an image (cached thumbnail or placeholder)");

    // The whole merged feed includes it too.
    const all = await feed.getFeedPage({ cursor: null, viewerId: memberId });
    assert.ok(all.items.some((item) => item.id === trees.id));

    // Following mode has no member author for an article — never shown there.
    const following = await feed.getFeedPage({ cursor: null, viewerId: memberId, authorIds: [adminId] });
    assert.ok(!following.items.some((item) => item.type === "article"));

    // Add by URL: refused for private addresses (the real transport's guard)
    // and for an article already in the queue, even with tracking params.
    await assert.rejects(() => server.addCuratedArticleByUrl(adminId, { url: "http://127.0.0.1/admin", communityIds: [] }), /private network/);
    await assert.rejects(
      () => server.addCuratedArticleByUrl(adminId, { url: "https://news.example.test/trees?utm_medium=x", communityIds: [] }),
      /already in the queue/,
    );
  });

  // Search mode also queries Meilisearch for the other feed domains, so it
  // needs a (scratch) instance: MEILI_HOST / MEILI_MASTER_KEY.
  it(
    "[AC:dfdf223a:ac_7] What's New search finds an approved article by its blurb",
    { skip: process.env.MEILI_HOST ? false : "set MEILI_HOST to a scratch Meilisearch to run" },
    async () => {
      const meili = await import("@/lib/meilisearch");
      await Promise.all([
        meili.ensureEventsIndexConfigured(),
        meili.ensureLibraryIndexConfigured(),
        meili.ensureForumsIndexConfigured(),
        meili.ensureAnnouncementsIndexConfigured(),
        meili.ensureSurveysIndexConfigured(),
        meili.ensureReviewItemsIndexConfigured(),
      ]);
      // Index creation is queued in Meilisearch, not awaited; on a freshly
      // started instance wait until searching every index works.
      let searched: Awaited<ReturnType<typeof feed.getFeedPage>> | undefined;
      for (let attempt = 0; attempt < 40 && !searched; attempt++) {
        searched = await feed.getFeedPage({ cursor: null, viewerId: memberId, q: "admin-written" }).catch(async (error) => {
          if (!/not found/i.test(String(error))) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250));
          return undefined;
        });
      }
      assert.ok(searched, "search became available");
      const approved = await db.externalArticle.findFirstOrThrow({ where: { status: "approved" } });
      assert.ok(searched.items.some((item) => item.id === approved.id));
      assert.equal(searched.countsByType?.article, 1);
      const miss = await feed.getFeedPage({ cursor: null, viewerId: memberId, q: "zzz-no-such-words" });
      assert.equal(miss.countsByType?.article, 0);
    },
  );

  it("[AC:dfdf223a:ac_8] non-admins are refused by every admin route wrapper", async () => {
    const { AuthError } = await import("@/lib/auth");
    const handler = async () => {
      throw new Error("handler must not run");
    };
    const forbidden = await route.withCuratedAdmin(handler, async () => {
      throw new AuthError(403);
    });
    assert.equal(forbidden.status, 403);
    const signedOut = await route.withCuratedAdmin(handler, async () => {
      throw new AuthError(401);
    });
    assert.equal(signedOut.status, 401);
    const notFound = await route.withCuratedAdmin(
      async () => {
        throw new server.CuratedArticleError(404, "Article not found.");
      },
      async () => ({ id: adminId }) as never,
    );
    assert.equal(notFound.status, 404);
  });

  it("[AC:dfdf223a:ac_9] members start and reply in an approved article's discussion; replies resurface it", async () => {
    const trees = await db.externalArticle.findFirstOrThrow({ where: { status: "approved" } });
    const rejected = await db.externalArticle.findFirstOrThrow({ where: { status: "rejected" } });
    await assert.rejects(() => server.startCuratedArticleDiscussion(rejected.id, memberId), /not found/i);

    const { threadId } = await server.startCuratedArticleDiscussion(trees.id, memberId);
    const again = await server.startCuratedArticleDiscussion(trees.id, adminId);
    assert.equal(again.threadId, threadId, "idempotent: one thread per article");
    const thread = await db.forumThread.findUniqueOrThrow({ where: { id: threadId }, include: { forum: true, posts: true } });
    assert.equal(thread.forum.slug, "from-the-web");
    assert.equal(thread.posts.length, 1);
    assert.match(thread.posts[0].body, /https:\/\/news\.example\.test\/trees/);

    const reply = await forums.createForumPost(threadId, adminId, { body: "Great read!", parentId: null, deidentificationConfirmed: false });
    const page = await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberId });
    const own = page.items.find((item) => item.id === trees.id);
    assert.ok(own?.article?.threadHref?.includes(threadId));
    assert.equal(own?.article?.replyCount, 1);
    const replyRow = page.items.find((item) => item.id === reply.id);
    assert.ok(replyRow, "the latest reply resurfaces the article as its own row");
    assert.equal(replyRow?.replyExcerpt, "Great read!");

    // Article threads stay off /forums and can't be edited or deleted on their own.
    const categories = await forums.getForumCategories(memberId);
    assert.ok(!categories.some((category) => category.slug === "from-the-web"));
    await assert.rejects(() => forums.deleteForumThread(threadId, adminId, true), /managed automatically/);

    // Unpublishing hides the thread (replies kept); re-approving shows it again.
    await server.setCuratedArticleStatus(trees.id, adminId, "rejected");
    assert.equal((await db.forumThread.findUniqueOrThrow({ where: { id: threadId } })).removed, true);
    assert.equal(await db.forumPost.count({ where: { threadId } }), 2);
    await server.setCuratedArticleStatus(trees.id, adminId, "approved");
    assert.equal((await db.forumThread.findUniqueOrThrow({ where: { id: threadId } })).removed, false);
  });

  it("[AC:dfdf223a:ac_5] the outbound-request guard refuses private and non-http targets", async () => {
    for (const target of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "http://[::1]/", "http://localhost/", "ftp://example.org/", "http://example.org:6379/"]) {
      await assert.rejects(() => fetchMod.assertPublicHttpUrl(new URL(target)), fetchMod.ArticleFetchError, target);
    }
  });
});
