// DB-backed integration test: versioned starter-source batches and the
// English-only checks. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database ("scratch"/"test" in its
// name). No network access: an injected transport serves feeds and pages.
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

const ENGLISH = "Researchers at the university have found that students who volunteer in their community learn more about science and are more likely to stay in school, according to a new study published this week.";
const FRENCH = "Les chercheurs de l'université ont découvert que les étudiants qui font du bénévolat dans leur communauté apprennent davantage les sciences et restent plus longtemps à l'école, selon une nouvelle étude.";

describe("Curated articles: international batch and English-only (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let seed: typeof import("@/lib/curated-article-seed");
  let data: typeof import("@/prisma/curated-article-sources-data");
  let fetchMod: typeof import("@/lib/curated-article-fetch");
  let server: typeof import("@/lib/curated-articles-server");
  let adminId: string;
  const web = new Map<string, string>();
  const get: import("@/lib/curated-article-fetch").HttpGet = async (target) => {
    const body = web.get(target);
    if (body === undefined) throw new fetchMod.ArticleFetchError(`HTTP 404 from ${new URL(target).hostname}.`);
    return { status: 200, url: target, headers: new Headers({ "content-type": "text/html" }), body: Buffer.from(body) };
  };
  const rss = (language: string | null, items: { title: string; link: string; description?: string }[]) =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${language ? `<language>${language}</language>` : ""}${items
      .map((i) => `<item><title>${i.title}</title><link>${i.link}</link>${i.description ? `<description>${i.description}</description>` : ""}<pubDate>${new Date().toUTCString()}</pubDate></item>`)
      .join("")}</channel></rss>`;

  before(async () => {
    ({ db } = await import("@/lib/db"));
    seed = await import("@/lib/curated-article-seed");
    data = await import("@/prisma/curated-article-sources-data");
    fetchMod = await import("@/lib/curated-article-fetch");
    server = await import("@/lib/curated-articles-server");
    adminId = (
      await db.user.upsert({
        where: { clerkUserId: "test_intl_admin" },
        update: { role: "admin" },
        create: { clerkUserId: "test_intl_admin", email: "intl-admin@example.test", name: "Intl admin", role: "admin" },
      })
    ).id;
    for (const slug of ["sciences", "technology", "healthcare", "education-career", "nature-outdoor", "humanities"]) {
      await db.community.upsert({ where: { slug }, update: {}, create: { name: `Intl ${slug}`, slug } });
    }
  });

  beforeEach(async () => {
    await db.forumThread.deleteMany({ where: { externalArticleId: { not: null } } });
    await db.externalArticle.deleteMany({});
    await db.articleSource.deleteMany({});
    await db.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: { curatedArticleSourcesSeedVersion: 0, curatedArticleSourcesSeededAt: null },
    });
  });

  it("[AC:783da79e:ac_1] the international batch has 22 sources; the 9 general-news ones are filtered and enabled", () => {
    const intl = data.INTERNATIONAL_ARTICLE_SOURCES;
    assert.equal(intl.length, 22);
    const general = intl.filter((s) => (s.includeKeywords?.length ?? 0) > 0);
    assert.equal(general.length, 9);
    assert.ok(general.every((s) => s.enabled === true && (s.excludeKeywords?.length ?? 0) > 0));
    assert.ok(intl.every((s) => s.kind === "rss" && s.url.startsWith("https://")));
    assert.equal(new Set(intl.map((s) => s.url)).size, 22, "no duplicate feeds");
  });

  it("[AC:783da79e:ac_3] a fresh environment gets every starter source", async () => {
    const result = await seed.seedStarterArticleSources();
    const expected = data.STARTER_SOURCE_BATCHES.reduce((n, b) => n + b.sources.length, 0);
    assert.equal(result.added, expected);
    assert.equal(await db.articleSource.count(), expected);
    const hindu = await db.articleSource.findFirstOrThrow({ where: { name: "The Hindu: Science" }, include: { communities: { include: { community: true } } } });
    assert.deepEqual(hindu.communities.map((c) => c.community.slug), ["sciences"], "community tags applied");
    assert.equal((await seed.seedStarterArticleSources()).added, 0, "running again adds nothing");
  });

  it("[AC:783da79e:ac_2] an already-seeded environment gets the new batch once, without re-creating deleted sources or duplicates", async () => {
    // Simulate the homelab: batch 1 seeded (old flag only), one batch-1 source
    // deleted by an admin, and one batch-2 feed already added by hand.
    const batch1 = data.STARTER_SOURCE_BATCHES[0].sources;
    for (const source of batch1.slice(1)) await db.articleSource.create({ data: { name: source.name, kind: source.kind, url: source.url } });
    const handAdded = data.INTERNATIONAL_ARTICLE_SOURCES[0];
    await db.articleSource.create({ data: { name: "My own copy", url: handAdded.url } });
    await db.siteSettings.update({ where: { id: 1 }, data: { curatedArticleSourcesSeededAt: new Date() } });

    const result = await seed.seedStarterArticleSources();
    assert.equal(result.added, 21, "22 international sources minus the one already present");
    assert.equal(result.version, 2);
    assert.equal(await db.articleSource.count({ where: { url: batch1[0].url } }), 0, "deleted batch-1 source stays deleted");
    assert.equal(await db.articleSource.count({ where: { url: handAdded.url } }), 1, "no duplicate");
    assert.equal((await seed.seedStarterArticleSources()).added, 0, "the batch is only applied once");
  });

  it("[AC:783da79e:ac_4] a feed that declares another language queues nothing and says why", async () => {
    const source = await db.articleSource.create({ data: { name: "French feed", url: "https://fr.example.test/feed" } });
    web.set("https://fr.example.test/feed", rss("fr-FR", [{ title: "Une étude", link: "https://fr.example.test/a", description: FRENCH }]));
    const result = await fetchMod.runCuratedArticleFetch({ force: true, get });
    assert.equal(result.status === "ran" && result.newCount, 0);
    const row = await db.articleSource.findUniqueOrThrow({ where: { id: source.id } });
    assert.match(row.lastError ?? "", /marked as "fr-FR", not English/);
  });

  it("[AC:783da79e:ac_5] non-English entries and pages are skipped; undeclared English is kept", async () => {
    await db.articleSource.create({ data: { name: "Mixed feed", url: "https://mix.example.test/feed" } });
    web.set(
      "https://mix.example.test/feed",
      rss("en-US", [
        { title: "Students and science", link: "https://mix.example.test/english", description: ENGLISH },
        { title: "Étudiants et sciences", link: "https://mix.example.test/french", description: FRENCH },
        { title: "Page says Indonesian", link: "https://mix.example.test/id-page" },
        { title: "Page declares nothing", link: "https://mix.example.test/plain" },
      ]),
    );
    web.set("https://mix.example.test/id-page", '<html lang="id"><head><title>x</title></head></html>');
    web.set("https://mix.example.test/plain", `<html><head><meta property="og:description" content="${ENGLISH}"></head></html>`);
    await fetchMod.runCuratedArticleFetch({ force: true, get });
    const titles = (await db.externalArticle.findMany({ select: { title: true }, orderBy: { title: "asc" } })).map((a) => a.title);
    assert.deepEqual(titles, ["Page declares nothing", "Students and science"]);
  });

  it("[AC:783da79e:ac_6] adding a non-English article by link is refused with a clear message", async () => {
    web.set("https://ar.example.test/story", '<html lang="ar"><head><meta property="og:title" content="خبر"></head></html>');
    await assert.rejects(
      () => server.addCuratedArticleByUrl(adminId, { url: "https://ar.example.test/story", communityIds: [] }, { get }),
      /marked as "ar", and only English articles can be shared/,
    );
    web.set("https://fr2.example.test/story", `<html><head><meta property="og:title" content="Une étude"><meta property="og:description" content="${FRENCH}"></head></html>`);
    await assert.rejects(
      () => server.addCuratedArticleByUrl(adminId, { url: "https://fr2.example.test/story", communityIds: [] }, { get }),
      /doesn't appear to be in English/,
    );
  });
});
