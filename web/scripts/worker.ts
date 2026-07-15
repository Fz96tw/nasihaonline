import "dotenv/config";
import { Worker } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";
import { SEARCH_INDEX_QUEUE_NAME, type SearchIndexSyncJob } from "@/lib/queues/search-index-queue";
import { ensureLibraryIndexConfigured, ensurePostsIndexConfigured, ensureProfilesIndexConfigured } from "@/lib/meilisearch";
import { syncKnowledgeItemToIndex, syncPostToIndex, syncProfileToIndex } from "@/lib/search-index-sync";

/**
 * Standalone process (`npm run worker`, docker-compose "worker" service) —
 * search-index sync deliberately never runs inline in a request handler
 * (§8's queue layer), so a slow/unavailable Meilisearch never blocks a
 * profile save.
 */
async function main() {
  await ensureProfilesIndexConfigured();
  await ensurePostsIndexConfigured();
  await ensureLibraryIndexConfigured();

  const worker = new Worker<SearchIndexSyncJob>(
    SEARCH_INDEX_QUEUE_NAME,
    async (job) => {
      if (job.data.type === "profile") {
        await syncProfileToIndex(job.data.userId);
      } else if (job.data.type === "post") {
        await syncPostToIndex(job.data.postId);
      } else if (job.data.type === "knowledge") {
        await syncKnowledgeItemToIndex(job.data.knowledgeItemId);
      }
    },
    { connection: queueConnection },
  );

  worker.on("completed", (job) => {
    const id = job.data.type === "profile" ? job.data.userId : job.data.type === "post" ? job.data.postId : job.data.knowledgeItemId;
    console.log(`[search-index-worker] synced ${job.data.type} ${id}`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[search-index-worker] failed job ${job?.id}:`, error);
  });

  console.log("[search-index-worker] listening for jobs on", SEARCH_INDEX_QUEUE_NAME);
}

main().catch((error) => {
  console.error("[search-index-worker] fatal error", error);
  process.exit(1);
});
