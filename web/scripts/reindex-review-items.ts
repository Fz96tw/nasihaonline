import "dotenv/config";
import { db } from "@/lib/db";
import { ensureReviewItemsIndexConfigured } from "@/lib/meilisearch";
import { syncReviewItemToIndex } from "@/lib/search-index-sync";

/**
 * One-off backfill for Peer Review items that predate the Meilisearch
 * index (§7.2), same rationale as scripts/reindex-forum-threads.ts.
 * Unfiltered: syncReviewItemToIndex has no index-eligibility exclusion at
 * all (a submitter/invitee must be able to find their own item regardless
 * of status/seekingReviewers — that gating happens at query time).
 *
 *   npx tsx scripts/reindex-review-items.ts
 */
async function main() {
  await ensureReviewItemsIndexConfigured();

  const items = await db.reviewItem.findMany({ select: { id: true } });
  console.log(`Reindexing ${items.length} review item(s)...`);

  for (const item of items) {
    await syncReviewItemToIndex(item.id);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
