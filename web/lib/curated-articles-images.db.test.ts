// DB-backed integration test for curated-article images: the article-body
// fallback and admin replace/remove. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database, plus a scratch MinIO
// (MINIO_ENDPOINT/MINIO_PORT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY) — images are
// really decoded, resized and stored. Refuses to run unless the database name
// contains "scratch" or "test". No network access: pages and images are
// served by an injected HTTP transport.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import sharp from "sharp";

const url = process.env.REFLECTION_TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.slice(1) : "";
const skip = !url
  ? "set REFLECTION_TEST_DATABASE_URL to a scratch database to run"
  : !/scratch|test/i.test(dbName)
    ? `refusing to run against "${dbName}": database name must contain "scratch" or "test"`
    : !process.env.MINIO_ENDPOINT
      ? "set MINIO_ENDPOINT (and keys) to a scratch MinIO to run"
      : false;

if (url && !skip) process.env.DATABASE_URL = url;

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toBuffer();

describe("Curated article images (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let fetchMod: typeof import("@/lib/curated-article-fetch");
  let server: typeof import("@/lib/curated-articles-server");
  let feed: typeof import("@/lib/feed-server");
  let route: typeof import("@/lib/curated-articles-route");
  let storage: typeof import("@/lib/storage");
  let adminId: string;
  let memberId: string;
  const requested: string[] = [];
  const web = new Map<string, Buffer | string | Error>();

  const get: import("@/lib/curated-article-fetch").HttpGet = async (target) => {
    requested.push(target);
    const body = web.get(target);
    if (body instanceof Error) throw body;
    if (body === undefined) throw new fetchMod.ArticleFetchError(`HTTP 404 from ${new URL(target).hostname}.`);
    return {
      status: 200,
      url: target,
      headers: new Headers({ "content-type": typeof body === "string" ? "text/html" : "image/png" }),
      body: typeof body === "string" ? Buffer.from(body) : body,
    };
  };
  const objectExists = async (key: string | null) => key !== null && (await storage.getAttachmentObject(key)) !== null;

  before(async () => {
    ({ db } = await import("@/lib/db"));
    fetchMod = await import("@/lib/curated-article-fetch");
    server = await import("@/lib/curated-articles-server");
    feed = await import("@/lib/feed-server");
    route = await import("@/lib/curated-articles-route");
    storage = await import("@/lib/storage");
    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await db.articleSource.deleteMany({});
    const mk = async (key: string, role: "admin" | "member") =>
      (
        await db.user.upsert({
          where: { clerkUserId: `test_images_${key}` },
          update: { role },
          create: { clerkUserId: `test_images_${key}`, email: `images-${key}@example.test`, name: `Images ${key}`, role },
        })
      ).id;
    adminId = await mk("admin", "admin");
    memberId = await mk("member", "member");
  });

  it("[AC:57bbacfa:ac_1] [AC:57bbacfa:ac_2] a fetched article with no feed or og image gets the first suitable body photo", async () => {
    await db.articleSource.create({ data: { name: "Body Feed", url: "https://bodyfeed.example.test/feed" } });
    web.set(
      "https://bodyfeed.example.test/feed",
      `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
        <item><title>Story with body photos</title><link>https://site.example.test/story</link><description>Teaser.</description><pubDate>${new Date().toUTCString()}</pubDate></item>
        <item><title>Story with only tiny images</title><link>https://site.example.test/tiny</link><description>Teaser.</description><pubDate>${new Date().toUTCString()}</pubDate></item>
      </channel></rss>`,
    );
    web.set(
      "https://site.example.test/story",
      `<html><head><title>Story</title></head><body>
        <header><img src="/brand/site-header.jpg"></header>
        <article><img src="/assets/logo.png"><img src="/img/broken.jpg"><img data-src="/img/lead.jpg" src="data:image/gif;base64,R0lG"></article>
      </body></html>`,
    );
    web.set("https://site.example.test/img/lead.jpg", await png(900, 500));
    // /img/broken.jpg is a 404: the next candidate is tried.
    web.set(
      "https://site.example.test/tiny",
      `<html><body><article>${Array.from({ length: 6 }, (_, i) => `<img src="/t${i}.jpg">`).join("")}</article></body></html>`,
    );
    for (let i = 0; i < 6; i++) web.set(`https://site.example.test/t${i}.jpg`, await png(120, 60));

    const result = await fetchMod.runCuratedArticleFetch({ force: true, get });
    assert.equal(result.status === "ran" && result.newCount, 2);
    const story = await db.externalArticle.findUniqueOrThrow({ where: { url: "https://site.example.test/story" } });
    assert.ok(await objectExists(story.imageKey), "the body photo was resized and cached");
    assert.equal(story.originalImageUrl, "https://site.example.test/img/lead.jpg");
    assert.ok(!requested.some((r) => r.includes("site-header") || r.includes("logo")), "header and logo images never fetched");

    const tiny = await db.externalArticle.findUniqueOrThrow({ where: { url: "https://site.example.test/tiny" } });
    assert.equal(tiny.imageKey, null, "every candidate too small -> placeholder");
    assert.equal(requested.filter((r) => /\/t\d\.jpg$/.test(r)).length, 4, "at most 4 candidates tried");
  });

  it("[AC:57bbacfa:ac_3] adding an article by link uses the same body-image fallback", async () => {
    web.set(
      "https://blog.example.test/post",
      `<html><head><meta property="og:title" content="Teens tutor neighbors"><meta property="og:site_name" content="Example Blog"></head>
       <body><main><img src="/photos/tutoring.png"></main></body></html>`,
    );
    web.set("https://blog.example.test/photos/tutoring.png", await png(800, 600));
    const dto = await server.addCuratedArticleByUrl(adminId, { url: "https://blog.example.test/post", communityIds: [] }, { get });
    assert.equal(dto.status, "pending");
    assert.ok(dto.imageUrl?.startsWith("/api/curated-articles/image/curated-article/"));
  });

  it("[AC:57bbacfa:ac_4] [AC:57bbacfa:ac_5] [AC:57bbacfa:ac_7] admins replace (upload or link) and remove an image; the feed reflects it at once", async () => {
    const article = await db.externalArticle.findUniqueOrThrow({ where: { url: "https://site.example.test/story" } });
    await server.setCuratedArticleStatus(article.id, adminId, "approved", { postNow: true });
    const feedImage = async () =>
      (await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberId })).items.find((item) => item.id === article.id)?.imageUrl;

    const uploaded = await server.replaceCuratedArticleImage(article.id, adminId, { upload: await png(1000, 600) });
    const afterUpload = await db.externalArticle.findUniqueOrThrow({ where: { id: article.id } });
    assert.notEqual(afterUpload.imageKey, article.imageKey);
    assert.equal(await objectExists(article.imageKey), false, "the previous cached image is deleted");
    assert.equal(await feedImage(), uploaded.imageUrl, "the feed shows the new image immediately");

    web.set("https://images.example.test/replacement.png", await png(640, 360));
    const linked = await server.replaceCuratedArticleImage(article.id, adminId, { url: "https://images.example.test/replacement.png" }, { get });
    assert.notEqual(linked.imageUrl, uploaded.imageUrl);
    assert.equal((await db.externalArticle.findUniqueOrThrow({ where: { id: article.id } })).originalImageUrl, "https://images.example.test/replacement.png");

    const removed = await server.removeCuratedArticleImage(article.id, adminId);
    assert.equal(removed.imageUrl, null);
    assert.equal(await feedImage(), "/images/from-the-web.svg", "no image -> placeholder in the feed");
    const actions = await db.adminActionLog.findMany({ where: { entityId: article.id }, select: { action: true } });
    assert.ok(actions.some((a) => a.action === "curated_articles.image_replaced"));
    assert.ok(actions.some((a) => a.action === "curated_articles.image_removed"));
  });

  it("[AC:57bbacfa:ac_6] bad files and unusable links are refused with a clear message", async () => {
    const article = await db.externalArticle.findFirstOrThrow();
    const tooSmall = await png(150, 80);
    const fine = await png(400, 300);
    await assert.rejects(() => server.replaceCuratedArticleImage(article.id, adminId, { upload: Buffer.from("not an image") }), /isn't a supported image/);
    await assert.rejects(() => server.replaceCuratedArticleImage(article.id, adminId, { upload: Buffer.alloc(5 * 1024 * 1024 + 1) }), /at most 5MB/);
    await assert.rejects(() => server.replaceCuratedArticleImage(article.id, adminId, { upload: tooSmall }), /too small/);
    await assert.rejects(() => server.replaceCuratedArticleImage(article.id, adminId, { url: "http://127.0.0.1/x.png" }), /private network/);
    await assert.rejects(
      () => server.replaceCuratedArticleImage(article.id, adminId, { url: "https://images.example.test/missing.png" }, { get }),
      /HTTP 404/,
    );
    await assert.rejects(() => server.replaceCuratedArticleImage("no-such-id", adminId, { upload: fine }), /not found/i);
    const error = await server.replaceCuratedArticleImage(article.id, adminId, { upload: Buffer.from("x") }).catch((e) => e);
    assert.equal(error instanceof server.CuratedArticleError && error.status, 400, "surfaced to the admin as a 400");
  });

  it("[AC:57bbacfa:ac_8] non-admins can't reach the image routes", async () => {
    const { AuthError } = await import("@/lib/auth");
    for (const code of [401, 403] as const) {
      const response = await route.withCuratedAdmin(
        async () => {
          throw new Error("handler must not run");
        },
        async () => {
          throw new AuthError(code);
        },
      );
      assert.equal(response.status, code);
    }
  });
});
