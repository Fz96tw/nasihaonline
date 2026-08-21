import "dotenv/config";
import { db } from "@/lib/db";
import { ensureEventsIndexConfigured } from "@/lib/meilisearch";
import { syncEventToIndex } from "@/lib/search-index-sync";

/**
 * One-off backfill for events that predate the Meilisearch index (§7.2),
 * same rationale as scripts/reindex-forum-threads.ts — the BullMQ sync only
 * fires on new writes, so existing rows need this to appear in global
 * search without being re-saved. Unfiltered: syncEventToIndex re-derives
 * index-eligibility (excludes only cancelled events) itself.
 *
 *   npx tsx scripts/reindex-events.ts
 */
async function main() {
  await ensureEventsIndexConfigured();

  const events = await db.event.findMany({ select: { id: true } });
  console.log(`Reindexing ${events.length} event(s)...`);

  for (const event of events) {
    await syncEventToIndex(event.id);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
