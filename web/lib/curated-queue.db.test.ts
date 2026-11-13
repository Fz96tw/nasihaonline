// DB-backed integration test for the From the Web review queue's paging,
// sort order and source filter. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
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

const HOUR = 60 * 60 * 1000;

describe("Curated article review queue paging (DB-backed)", { skip }, () => {
  let server: typeof import("@/lib/curated-articles-server");
  let sourceA: string;
  let sourceB: string;
  // Article n was fetched n hours ago: n = 1 is the newest.
  const titleOf = (n: number) => `Article ${String(n).padStart(3, "0")}`;

  before(async () => {
    const { db } = await import("@/lib/db");
    server = await import("@/lib/curated-articles-server");
    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await db.articleSource.deleteMany({});
    sourceA = (await db.articleSource.create({ data: { name: "Source A", url: "https://a.example.test/feed" } })).id;
    sourceB = (await db.articleSource.create({ data: { name: "Source B", url: "https://b.example.test/feed" } })).id;
    const now = Date.now();
    await db.externalArticle.createMany({
      data: Array.from({ length: 120 }, (_, i) => {
        const n = i + 1;
        return {
          url: `https://news.example.test/${n}`,
          title: titleOf(n),
          excerpt: "x",
          sourceName: "Example",
          status: "pending" as const,
          fetchedAt: new Date(now - n * HOUR),
          // 1–70 from A, 71–110 from B, 111–120 added by link.
          sourceId: n <= 70 ? sourceA : n <= 110 ? sourceB : null,
        };
      }),
    });
  });

  it("[AC:dddb06dd:ac_1] pages through every article, 50 at a time", async () => {
    const p1 = await server.listCuratedArticles("pending", { page: 1 });
    const p3 = await server.listCuratedArticles("pending", { page: 3 });
    assert.equal(p1.total, 120);
    assert.equal(p1.pageCount, 3);
    assert.equal(p1.items.length, 50);
    assert.equal(p3.items.length, 20);
    const all = new Set<string>();
    for (const page of [1, 2, 3]) for (const item of (await server.listCuratedArticles("pending", { page })).items) all.add(item.id);
    assert.equal(all.size, 120, "no article is unreachable, none repeated");
  });

  it("[AC:dddb06dd:ac_2] sorts newest or oldest first", async () => {
    const newest = await server.listCuratedArticles("pending", { sort: "newest" });
    const oldest = await server.listCuratedArticles("pending", { sort: "oldest" });
    assert.equal(newest.items[0].title, titleOf(1));
    assert.equal(oldest.items[0].title, titleOf(120), "oldest-first reaches the articles closest to expiring");
    const defaultOrder = await server.listCuratedArticles("pending");
    assert.equal(defaultOrder.items[0].title, titleOf(1), "Pending defaults to newest first");
  });

  it("[AC:dddb06dd:ac_3] filters to one source or to articles added by link, with matching totals", async () => {
    const a = await server.listCuratedArticles("pending", { source: sourceA });
    const b = await server.listCuratedArticles("pending", { source: sourceB, sort: "oldest" });
    const added = await server.listCuratedArticles("pending", { source: "added" });
    assert.equal(a.total, 70);
    assert.equal(a.pageCount, 2);
    assert.equal(b.total, 40);
    assert.equal(b.items[0].title, titleOf(110));
    assert.equal(added.total, 10);
    assert.ok(added.items.every((item) => item.sourceId === null));
    assert.ok(a.items.every((item) => item.sourceId === sourceA));
  });

  it("[AC:dddb06dd:ac_4] an out-of-range page shows the last page", async () => {
    const tooFar = await server.listCuratedArticles("pending", { page: 99 });
    assert.equal(tooFar.page, 3);
    assert.equal(tooFar.items.length, 20);
    const empty = await server.listCuratedArticles("rejected", { page: 5 });
    assert.deepEqual([empty.page, empty.pageCount, empty.items.length], [1, 1, 0]);
  });
});
