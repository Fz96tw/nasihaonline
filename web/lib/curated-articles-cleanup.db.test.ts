// DB-backed integration test for the From the Web cleanup safeguards: ever-
// published articles are never auto-deleted, and rejected articles' cached
// images expire. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database ("scratch"/"test" in its
// name) plus a scratch MinIO (MINIO_ENDPOINT etc.) — real images are stored.
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

const DAY = 24 * 60 * 60 * 1000;

describe("Curated article cleanup safeguards (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let fetchMod: typeof import("@/lib/curated-article-fetch");
  let server: typeof import("@/lib/curated-articles-server");
  let storage: typeof import("@/lib/storage");
  let adminId: string;
  let memberId: string;
  let seq = 0;
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const image = async () =>
    fetchMod.storeArticleImage(await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 120, b: 90 } } }).png().toBuffer());
  const exists = async (key: string | null) => key !== null && (await storage.getAttachmentObject(key)) !== null;
  const article = async (data: Record<string, unknown>) =>
    db.externalArticle.create({
      data: { url: `https://cleanup.example.test/${++seq}`, title: `Article ${seq}`, excerpt: "x", sourceName: "Pub", ...data },
    });

  before(async () => {
    ({ db } = await import("@/lib/db"));
    fetchMod = await import("@/lib/curated-article-fetch");
    server = await import("@/lib/curated-articles-server");
    storage = await import("@/lib/storage");
    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await db.forum.upsert({ where: { slug: "from-the-web" }, update: { active: true }, create: { name: "From the Web", slug: "from-the-web" } });
    const mk = async (key: string, role: "admin" | "member") =>
      (
        await db.user.upsert({
          where: { clerkUserId: `test_cleanup_${key}` },
          update: { role },
          create: { clerkUserId: `test_cleanup_${key}`, email: `cleanup-${key}@example.test`, name: `Cleanup ${key}`, role },
        })
      ).id;
    adminId = await mk("admin", "admin");
    memberId = await mk("member", "member");
  });

  it("[AC:049bcf3d:ac_1] [AC:049bcf3d:ac_2] an article that was ever published survives the pending cleanup with its discussion; never-published ones are still cleaned up", async () => {
    const discussed = await article({ status: "approved", approvedAt: ago(40), fetchedAt: ago(41), imageKey: await image() });
    const { threadId } = await server.startCuratedArticleDiscussion(discussed.id, memberId);
    await db.forumPost.create({ data: { threadId, authorId: memberId, body: "A member's reply" } });
    // An admin moves it back to pending; its fetch date is long past the retention window.
    await server.setCuratedArticleStatus(discussed.id, adminId, "pending");

    const neverPublished = await article({ status: "pending", fetchedAt: ago(40), imageKey: await image() });

    const pruned = await fetchMod.pruneStalePendingArticles(now, 30);
    assert.equal(pruned, 1, "only the never-published article is removed");
    assert.ok(await db.externalArticle.findUnique({ where: { id: discussed.id } }), "the once-published article is kept");
    assert.equal(await db.forumPost.count({ where: { threadId } }), 2, "its discussion and reply are kept");
    assert.ok(await exists(discussed.imageKey), "and so is its image");
    assert.equal(await db.externalArticle.findUnique({ where: { id: neverPublished.id } }), null);
    assert.equal(await exists(neverPublished.imageKey), false, "the removed article's image is deleted too");
  });

  it("[AC:049bcf3d:ac_3] [AC:049bcf3d:ac_4] rejected articles lose their image after the retention period; the article is kept and other images are untouched", async () => {
    const oldRejected = await article({ status: "rejected", reviewedAt: ago(31), fetchedAt: ago(35), imageKey: await image() });
    const recentRejected = await article({ status: "rejected", reviewedAt: ago(5), fetchedAt: ago(35), imageKey: await image() });
    const oldPending = await article({ status: "pending", fetchedAt: ago(2), imageKey: await image() });
    const oldScheduled = await article({ status: "scheduled", scheduledAt: ago(40), fetchedAt: ago(40), reviewedAt: ago(40), imageKey: await image() });
    const oldPublished = await article({ status: "approved", approvedAt: ago(60), reviewedAt: ago(60), fetchedAt: ago(60), imageKey: await image() });

    assert.equal(await fetchMod.pruneRejectedArticleImages(now, 30), 1);
    const after = await db.externalArticle.findUniqueOrThrow({ where: { id: oldRejected.id } });
    assert.equal(after.status, "rejected", "the rejected article itself is kept, so it isn't fetched again");
    assert.equal(after.imageKey, null);
    assert.equal(await exists(oldRejected.imageKey), false, "its image is gone from storage");
    for (const kept of [recentRejected, oldPending, oldScheduled, oldPublished]) {
      const row = await db.externalArticle.findUniqueOrThrow({ where: { id: kept.id } });
      assert.equal(row.imageKey, kept.imageKey, `${row.status} article keeps its image`);
      assert.ok(await exists(kept.imageKey));
    }
    assert.equal(await fetchMod.pruneRejectedArticleImages(now, 30), 0, "nothing left to clear");
  });
});
