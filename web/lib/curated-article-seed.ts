// No "server-only" guard: run from prisma/seed.ts (tsx, outside Next).
import { db } from "@/lib/db";
import { STARTER_SOURCE_BATCHES } from "@/prisma/curated-article-sources-data";

/**
 * Inserts every starter-source batch newer than the environment's recorded
 * version, then records the newest. Within a batch, a source whose URL is
 * already present is skipped (no duplicates), and a source an admin deleted
 * from an earlier batch is never re-created, because that batch isn't
 * replayed. Fetching itself stays off until an admin enables it.
 */
export async function seedStarterArticleSources(): Promise<{ added: number; version: number }> {
  const settings = await db.siteSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  // Environments seeded before versions existed have batch 1 (the migration
  // sets this too; kept here so a missed backfill can't duplicate batch 1).
  const done = Math.max(settings.curatedArticleSourcesSeedVersion, settings.curatedArticleSourcesSeededAt ? 1 : 0);
  const pending = STARTER_SOURCE_BATCHES.filter((batch) => batch.version > done);
  if (pending.length === 0) return { added: 0, version: done };

  const communities = await db.community.findMany({ select: { id: true, slug: true } });
  const idBySlug = new Map(communities.map((community) => [community.slug, community.id]));
  const existingUrls = new Set((await db.articleSource.findMany({ select: { url: true } })).map((s) => s.url));
  let added = 0;
  for (const batch of pending) {
    for (const source of batch.sources) {
      if (existingUrls.has(source.url)) continue;
      existingUrls.add(source.url);
      await db.articleSource.create({
        data: {
          name: source.name,
          kind: source.kind,
          url: source.url,
          includeKeywords: (source.includeKeywords ?? []).map((keyword) => keyword.toLowerCase()),
          excludeKeywords: (source.excludeKeywords ?? []).map((keyword) => keyword.toLowerCase()),
          enabled: source.enabled ?? true,
          communities: {
            create: source.communities.flatMap((slug) => {
              const id = idBySlug.get(slug);
              return id ? [{ communityId: id }] : [];
            }),
          },
        },
      });
      added++;
    }
  }
  const version = pending[pending.length - 1].version;
  await db.siteSettings.update({
    where: { id: 1 },
    data: { curatedArticleSourcesSeedVersion: version, curatedArticleSourcesSeededAt: settings.curatedArticleSourcesSeededAt ?? new Date() },
  });
  return { added, version };
}
