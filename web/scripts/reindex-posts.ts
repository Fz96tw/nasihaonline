import "dotenv/config";
import { db } from "@/lib/db";
import { ensurePostsIndexConfigured } from "@/lib/meilisearch";
import { syncPostToIndex } from "@/lib/search-index-sync";

/**
 * One-off backfill for published posts that predate the Meilisearch index
 * (§7.2), same rationale as scripts/reindex-profiles.ts.
 *
 *   npx tsx scripts/reindex-posts.ts
 */
async function main() {
  await ensurePostsIndexConfigured();

  const posts = await db.post.findMany({ where: { publishedAt: { not: null } }, select: { id: true } });
  console.log(`Reindexing ${posts.length} published post(s)...`);

  for (const post of posts) {
    await syncPostToIndex(post.id);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
