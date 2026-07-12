import "dotenv/config";
import { db } from "@/lib/db";
import { ensureProfilesIndexConfigured } from "@/lib/meilisearch";
import { syncProfileToIndex } from "@/lib/search-index-sync";

/**
 * One-off backfill for profiles that predate the Meilisearch index (§7.2) —
 * the BullMQ sync only fires on new writes, so existing rows need this to
 * appear in Directory search without being re-saved by their owner.
 *
 *   npx tsx scripts/reindex-profiles.ts
 */
async function main() {
  await ensureProfilesIndexConfigured();

  const profiles = await db.profile.findMany({ select: { userId: true } });
  console.log(`Reindexing ${profiles.length} profile(s)...`);

  for (const profile of profiles) {
    await syncProfileToIndex(profile.userId);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
