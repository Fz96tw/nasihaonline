import "dotenv/config";
import { db } from "@/lib/db";
import { ensureAnnouncementsIndexConfigured } from "@/lib/meilisearch";
import { syncAnnouncementToIndex } from "@/lib/search-index-sync";

/**
 * One-off backfill for announcements that predate the Meilisearch index
 * (§7.2), same rationale as scripts/reindex-forum-threads.ts. Unfiltered:
 * syncAnnouncementToIndex re-derives index-eligibility (sent, not
 * retracted, shown in feed) itself.
 *
 *   npx tsx scripts/reindex-announcements.ts
 */
async function main() {
  await ensureAnnouncementsIndexConfigured();

  const announcements = await db.announcement.findMany({ select: { id: true } });
  console.log(`Reindexing ${announcements.length} announcement(s)...`);

  for (const announcement of announcements) {
    await syncAnnouncementToIndex(announcement.id);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
