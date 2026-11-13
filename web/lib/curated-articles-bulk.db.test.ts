// DB-backed integration test for the From the Web pending-retention setting
// and bulk reject actions. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database. Refuses to run unless the
// database name contains "scratch" or "test". No network access.
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

const url = process.env.REFLECTION_TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.slice(1) : "";
const skip = !url
  ? "set REFLECTION_TEST_DATABASE_URL to a scratch database to run"
  : !/scratch|test/i.test(dbName)
    ? `refusing to run against "${dbName}": database name must contain "scratch" or "test"`
    : false;

if (url && !skip) process.env.DATABASE_URL = url;

const DAY = 24 * 60 * 60 * 1000;

describe("Curated article retention and bulk actions (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let fetchMod: typeof import("@/lib/curated-article-fetch");
  let server: typeof import("@/lib/curated-articles-server");
  let settings: typeof import("@/lib/settings");
  let route: typeof import("@/lib/curated-articles-route");
  let adminId: string;
  let seq = 0;
  const now = new Date();

  const article = async (status: "pending" | "scheduled" | "approved" | "rejected", fetchedDaysAgo: number) =>
    (
      await db.externalArticle.create({
        data: {
          url: `https://bulk.example.test/${++seq}`,
          title: `Article ${seq}`,
          excerpt: "Teaser.",
          sourceName: "Example",
          status,
          fetchedAt: new Date(now.getTime() - fetchedDaysAgo * DAY),
          ...(status === "approved" ? { approvedAt: new Date(now.getTime() - fetchedDaysAgo * DAY) } : {}),
          ...(status === "scheduled" ? { scheduledAt: new Date(now.getTime() - fetchedDaysAgo * DAY) } : {}),
        },
      })
    ).id;
  const statusOf = async (id: string) => (await db.externalArticle.findUnique({ where: { id } }))?.status ?? "deleted";

  before(async () => {
    ({ db } = await import("@/lib/db"));
    fetchMod = await import("@/lib/curated-article-fetch");
    server = await import("@/lib/curated-articles-server");
    settings = await import("@/lib/settings");
    route = await import("@/lib/curated-articles-route");
    adminId = (
      await db.user.upsert({
        where: { clerkUserId: "test_bulk_admin" },
        update: { role: "admin" },
        create: { clerkUserId: "test_bulk_admin", email: "bulk-admin@example.test", name: "Bulk admin", role: "admin" },
      })
    ).id;
  });

  beforeEach(async () => {
    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await db.articleSource.deleteMany({});
    await settings.setCuratedArticlesPendingRetentionDays(30);
  });

  it("[AC:55d917ec:ac_1] the retention setting is stored and read back (default 30)", async () => {
    assert.equal(await settings.getCuratedArticlesPendingRetentionDays(), 30);
    await settings.setCuratedArticlesPendingRetentionDays(7);
    assert.equal(await settings.getCuratedArticlesPendingRetentionDays(), 7);
  });

  it("[AC:55d917ec:ac_2] cleanup deletes only pending articles older than the configured retention", async () => {
    await settings.setCuratedArticlesPendingRetentionDays(7);
    const oldPending = await article("pending", 10);
    const freshPending = await article("pending", 3);
    const oldScheduled = await article("scheduled", 10);
    const oldPublished = await article("approved", 10);
    const oldRejected = await article("rejected", 10);
    assert.equal(await fetchMod.pruneStalePendingArticles(now), 1);
    assert.equal(await statusOf(oldPending), "deleted");
    assert.equal(await statusOf(freshPending), "pending");
    assert.equal(await statusOf(oldScheduled), "scheduled");
    assert.equal(await statusOf(oldPublished), "approved");
    assert.equal(await statusOf(oldRejected), "rejected");
  });

  it("[AC:55d917ec:ac_3] the fetch ignores entries older than the retention window, so cleaned-up articles don't come back", async () => {
    await settings.setCuratedArticlesPendingRetentionDays(7);
    await db.articleSource.create({ data: { name: "Window Feed", url: "https://window.example.test/feed" } });
    const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>Ten days old</title><link>https://window.example.test/old</link><description>x</description><pubDate>${new Date(now.getTime() - 10 * DAY).toUTCString()}</pubDate></item>
      <item><title>Three days old</title><link>https://window.example.test/new</link><description>x</description><pubDate>${new Date(now.getTime() - 3 * DAY).toUTCString()}</pubDate></item>
    </channel></rss>`;
    const get: import("@/lib/curated-article-fetch").HttpGet = async (target) => {
      if (target !== "https://window.example.test/feed") throw new fetchMod.ArticleFetchError("HTTP 404");
      return { status: 200, url: target, headers: new Headers(), body: Buffer.from(feed) };
    };
    const result = await fetchMod.runCuratedArticleFetch({ force: true, get, now });
    assert.equal(result.status === "ran" && result.newCount, 1);
    assert.deepEqual((await db.externalArticle.findMany({ select: { title: true } })).map((a) => a.title), ["Three days old"]);
  });

  it("[AC:55d917ec:ac_4] [AC:55d917ec:ac_6] reject selected touches only pending/scheduled articles and logs one audit entry", async () => {
    const p1 = await article("pending", 1);
    const p2 = await article("pending", 2);
    const s1 = await article("scheduled", 1);
    const published = await article("approved", 1);
    const untouched = await article("pending", 1);
    const result = await server.bulkRejectCuratedArticles([p1, p2, s1, published, p1], adminId, now);
    assert.equal(result.rejected, 3);
    assert.equal(await statusOf(p1), "rejected");
    assert.equal(await statusOf(s1), "rejected");
    assert.equal((await db.externalArticle.findUniqueOrThrow({ where: { id: s1 } })).scheduledAt, null, "leaves the release queue");
    assert.equal(await statusOf(published), "approved", "published articles are never bulk-rejected");
    assert.equal(await statusOf(untouched), "pending");
    const log = await db.adminActionLog.findMany({ where: { actorId: adminId, action: "curated_articles.bulk_rejected" } });
    assert.equal(log.length, 1);
    assert.equal((log[0].metadata as { count: number }).count, 3);
  });

  it("[AC:55d917ec:ac_5] [AC:55d917ec:ac_6] reject all pending older than X days, with a count for the confirmation", async () => {
    const old1 = await article("pending", 9);
    const old2 = await article("pending", 15);
    const recent = await article("pending", 2);
    const oldScheduled = await article("scheduled", 20);
    const oldPublished = await article("approved", 20);
    assert.equal(await server.countPendingOlderThan(7, now), 2);
    assert.deepEqual(await server.rejectPendingOlderThan(7, adminId, now), { rejected: 2 });
    assert.equal(await statusOf(old1), "rejected");
    assert.equal(await statusOf(old2), "rejected");
    assert.equal(await statusOf(recent), "pending");
    assert.equal(await statusOf(oldScheduled), "scheduled");
    assert.equal(await statusOf(oldPublished), "approved");
    assert.deepEqual(await server.rejectPendingOlderThan(7, adminId, now), { rejected: 0 }, "nothing left to reject");
  });

  it("[AC:55d917ec:ac_7] the settings and bulk routes refuse non-admins", async () => {
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
