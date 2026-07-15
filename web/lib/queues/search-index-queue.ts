// No "server-only" guard: scripts/worker.ts imports SEARCH_INDEX_QUEUE_NAME
// and SearchIndexSyncJob from this module and runs outside Next's runtime.
import { Queue } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";

export const SEARCH_INDEX_QUEUE_NAME = "search-index-sync";

export type SearchIndexSyncJob = { type: "profile"; userId: string } | { type: "post"; postId: string };

const globalForSearchIndexQueue = globalThis as unknown as {
  searchIndexQueue: Queue<SearchIndexSyncJob> | undefined;
};

const searchIndexQueue =
  globalForSearchIndexQueue.searchIndexQueue ??
  new Queue<SearchIndexSyncJob>(SEARCH_INDEX_QUEUE_NAME, { connection: queueConnection });

if (process.env.NODE_ENV !== "production") globalForSearchIndexQueue.searchIndexQueue = searchIndexQueue;

/**
 * Called from every Profile write path (PATCH/avatar upload/avatar delete,
 * §4.3) so the Meilisearch index (§7.2) never drifts from Postgres. The
 * worker (scripts/worker.ts) re-derives directory eligibility from the DB
 * rather than trusting the job payload, so this only needs the userId.
 */
export async function enqueueProfileIndexSync(userId: string): Promise<void> {
  await searchIndexQueue.add(
    "profile-sync",
    { type: "profile", userId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}

/**
 * Called from POST /api/blog (§4.8) so the Meilisearch index (§7.2) never
 * drifts from Postgres — same DB-write → BullMQ → index-sync pattern as
 * enqueueProfileIndexSync.
 */
export async function enqueuePostIndexSync(postId: string): Promise<void> {
  await searchIndexQueue.add(
    "post-sync",
    { type: "post", postId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}
