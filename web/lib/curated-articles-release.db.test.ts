// DB-backed integration test for the "From the Web" release queue. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database. It writes real rows, so
// it refuses to run unless the database name contains "scratch" or "test".
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("Curated article release queue (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let server: typeof import("@/lib/curated-articles-server");
  let release: typeof import("@/lib/curated-articles-release");
  let feed: typeof import("@/lib/feed-server");
  let settings: typeof import("@/lib/settings");
  let route: typeof import("@/lib/curated-articles-route");
  let adminId: string;
  let memberId: string;
  let health: string;
  let science: string;
  let seq = 0;

  const article = async (communityIds: string[], extra: Record<string, unknown> = {}) =>
    (
      await db.externalArticle.create({
        data: {
          url: `https://release.example.test/${++seq}`,
          title: `Article ${seq}`,
          excerpt: "Teaser.",
          sourceName: "Example",
          communities: { create: communityIds.map((communityId) => ({ communityId })) },
          ...extra,
        },
      })
    ).id;
  const statusOf = async (id: string) => (await db.externalArticle.findUniqueOrThrow({ where: { id } })).status;
  const feedIds = async () =>
    (await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberId })).items.map((item) => item.id);

  before(async () => {
    ({ db } = await import("@/lib/db"));
    server = await import("@/lib/curated-articles-server");
    release = await import("@/lib/curated-articles-release");
    feed = await import("@/lib/feed-server");
    settings = await import("@/lib/settings");
    route = await import("@/lib/curated-articles-route");
    await db.forum.upsert({
      where: { slug: "from-the-web" },
      update: { active: true },
      create: { name: "From the Web", slug: "from-the-web", displayOrder: 9 },
    });
    const mkCommunity = async (slug: string) =>
      (await db.community.upsert({ where: { slug }, update: {}, create: { name: `Release ${slug}`, slug } })).id;
    health = await mkCommunity("release-test-health");
    science = await mkCommunity("release-test-science");
    const mkUser = async (key: string, role: "admin" | "member") =>
      (
        await db.user.upsert({
          where: { clerkUserId: `test_release_${key}` },
          update: { role },
          create: { clerkUserId: `test_release_${key}`, email: `release-${key}@example.test`, name: `Release ${key}`, role },
        })
      ).id;
    adminId = await mkUser("admin", "admin");
    memberId = await mkUser("member", "member");
  });

  beforeEach(async () => {
    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await settings.setCuratedArticlesPerCommunityPerWeek(3);
  });

  it("[AC:0adb7110:ac_1] approving a never-published article queues it instead of publishing it", async () => {
    const id = await article([health]);
    const dto = await server.setCuratedArticleStatus(id, adminId, "approved");
    assert.equal(dto.status, "scheduled");
    assert.ok(dto.scheduledAt);
    assert.equal(dto.approvedAt, null);
    assert.deepEqual(await feedIds(), [], "a scheduled article isn't in What's New");
    // Approving again while queued keeps its place.
    const again = await server.setCuratedArticleStatus(id, adminId, "approved");
    assert.equal(again.scheduledAt, dto.scheduledAt);
  });

  it("[AC:0adb7110:ac_2] [AC:0adb7110:ac_6] the release tick publishes oldest-first, one per community slot, within the weekly cap", async () => {
    const t0 = new Date();
    const h1 = await article([health], { status: "scheduled", scheduledAt: new Date(t0.getTime() - 3 * HOUR) });
    const h2 = await article([health], { status: "scheduled", scheduledAt: new Date(t0.getTime() - 2 * HOUR) });
    const s1 = await article([science], { status: "scheduled", scheduledAt: new Date(t0.getTime() - 1 * HOUR) });
    const g1 = await article([], { status: "scheduled", scheduledAt: new Date(t0.getTime() - 1 * HOUR) });

    const first = await release.releaseDueCuratedArticles(t0);
    assert.deepEqual(first.released.sort(), [h1, s1, g1].sort(), "oldest health article + science + the General slot");
    assert.equal(await statusOf(h2), "scheduled", "health already released this tick");
    const ids = await feedIds();
    assert.deepEqual(ids.sort(), [h1, s1, g1].sort(), "released articles are in What's New");
    const released = await db.externalArticle.findUniqueOrThrow({ where: { id: h1 } });
    assert.equal(released.approvedAt?.getTime(), t0.getTime(), "release time is the feed position");

    // Discussion works the same as for any published article.
    const { threadId } = await server.startCuratedArticleDiscussion(h1, memberId);
    assert.ok(threadId);

    // perWeek 3 -> 56h gap: nothing more for health until then.
    assert.deepEqual((await release.releaseDueCuratedArticles(new Date(t0.getTime() + 55 * HOUR))).released, []);
    assert.deepEqual((await release.releaseDueCuratedArticles(new Date(t0.getTime() + 56 * HOUR))).released, [h2]);
  });

  it("[AC:0adb7110:ac_2] [AC:0adb7110:ac_3] the per-week setting changes the cap, and articles posted now count toward it", async () => {
    await settings.setCuratedArticlesPerCommunityPerWeek(1);
    assert.equal(await settings.getCuratedArticlesPerCommunityPerWeek(), 1);
    const now = new Date();
    // Posted now 2 days ago -> health is used up for the week.
    await article([health], { status: "approved", approvedAt: new Date(now.getTime() - 2 * DAY) });
    const queued = await article([health], { status: "scheduled", scheduledAt: new Date(now.getTime() - DAY) });
    assert.deepEqual((await release.releaseDueCuratedArticles(now)).released, []);
    assert.deepEqual((await release.releaseDueCuratedArticles(new Date(now.getTime() + 5 * DAY + HOUR))).released, [queued]);
  });

  it("[AC:0adb7110:ac_4] Post now publishes immediately; a queued article can go back to pending or be rejected", async () => {
    const a = await article([health]);
    await server.setCuratedArticleStatus(a, adminId, "approved");
    const posted = await server.setCuratedArticleStatus(a, adminId, "approved", { postNow: true });
    assert.equal(posted.status, "approved");
    assert.ok(posted.approvedAt);
    assert.deepEqual(await feedIds(), [a]);

    const b = await article([science]);
    await server.setCuratedArticleStatus(b, adminId, "approved");
    const back = await server.setCuratedArticleStatus(b, adminId, "pending");
    assert.equal(back.status, "pending");
    assert.equal(back.scheduledAt, null, "leaving the queue clears its place");
    await server.setCuratedArticleStatus(b, adminId, "approved");
    assert.equal((await server.setCuratedArticleStatus(b, adminId, "rejected")).status, "rejected");
    assert.deepEqual((await release.releaseDueCuratedArticles()).released, [], "nothing left in the queue");
  });

  it("[AC:0adb7110:ac_5] the Scheduled overview reports per-community queue counts and release estimates", async () => {
    const now = new Date();
    const q1 = await article([health], { status: "scheduled", scheduledAt: new Date(now.getTime() - 2 * HOUR) });
    const q2 = await article([health], { status: "scheduled", scheduledAt: new Date(now.getTime() - HOUR) });
    const overview = await release.getScheduledOverview(now);
    assert.equal(overview.perWeek, 3);
    const healthRow = overview.slots.find((slot) => slot.slot === health);
    assert.equal(healthRow?.queued, 2);
    assert.equal(healthRow?.label, "Release release-test-health");
    assert.ok(overview.estimates[q1] && overview.estimates[q2]);
    assert.ok(new Date(overview.estimates[q2]!).getTime() - new Date(overview.estimates[q1]!).getTime() >= 56 * HOUR, "spaced by 7/N days");
    const listed = await server.listCuratedArticles("scheduled");
    assert.deepEqual(listed.items.map((item) => item.id), [q1, q2], "Scheduled tab lists the queue in release order");
  });

  it("[AC:0adb7110:ac_7] re-approving a previously published article republishes it at its original feed position", async () => {
    const original = new Date(Date.now() - 3 * DAY);
    const id = await article([health], { status: "approved", approvedAt: original });
    await server.setCuratedArticleStatus(id, adminId, "rejected");
    const republished = await server.setCuratedArticleStatus(id, adminId, "approved");
    assert.equal(republished.status, "approved", "no trip through the queue");
    assert.equal(republished.approvedAt, original.toISOString());
    const row = (await feed.getFeedPage({ cursor: null, types: ["article"], viewerId: memberId })).items.find((item) => item.id === id);
    assert.equal(row?.timestamp, original.toISOString());
  });

  it("[AC:0adb7110:ac_8] the settings and status routes refuse non-admins", async () => {
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
