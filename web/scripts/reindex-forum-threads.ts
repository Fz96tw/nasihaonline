import "dotenv/config";
import { db } from "@/lib/db";
import { ensureForumsIndexConfigured } from "@/lib/meilisearch";
import { syncForumThreadToIndex } from "@/lib/search-index-sync";

/**
 * One-off backfill for forum threads that predate the Meilisearch index
 * (§7.2), same rationale as scripts/reindex-library.ts/reindex-profiles.ts —
 * the BullMQ sync only fires on new writes, so existing rows need this to
 * appear in Forums search without being re-saved.
 *
 *   npx tsx scripts/reindex-forum-threads.ts
 */
async function main() {
  await ensureForumsIndexConfigured();

  const threads = await db.forumThread.findMany({ select: { id: true } });
  console.log(`Reindexing ${threads.length} forum thread(s)...`);

  for (const thread of threads) {
    await syncForumThreadToIndex(thread.id);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
