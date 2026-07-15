import "dotenv/config";
import { db } from "@/lib/db";
import { ensureLibraryIndexConfigured } from "@/lib/meilisearch";
import { syncKnowledgeItemToIndex } from "@/lib/search-index-sync";
import { KnowledgeStatus } from "@/lib/generated/prisma/enums";

/**
 * One-off backfill for published/flagged Knowledge Library items that
 * predate the Meilisearch index (§7.2), same rationale as
 * scripts/reindex-posts.ts.
 *
 *   npx tsx scripts/reindex-library.ts
 */
async function main() {
  await ensureLibraryIndexConfigured();

  const items = await db.knowledgeItem.findMany({
    where: { status: { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] } },
    select: { id: true },
  });
  console.log(`Reindexing ${items.length} library item(s)...`);

  for (const item of items) {
    await syncKnowledgeItemToIndex(item.id);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
