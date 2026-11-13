// No "server-only" guard: scripts/worker.ts imports this module and runs
// outside Next's runtime — same convention as weekly-reflection-queue.ts.
import { Queue } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";

export const CURATED_ARTICLES_QUEUE_NAME = "curated-articles";

/** "scheduled" = the 6-hourly tick (honors the site-wide on/off switch); "manual" = an admin's "Fetch now". */
export type CuratedArticlesJob = { type: "scheduled" } | { type: "manual"; sourceIds?: string[] };

// Fixed jobId so re-registering on every worker boot is idempotent rather
// than stacking a duplicate schedule per restart.
const REPEAT_JOB_ID = "curated-articles-fetch";
const REPEAT_INTERVAL_MS = 6 * 60 * 60 * 1000;

const globalForCuratedArticlesQueue = globalThis as unknown as {
  curatedArticlesQueue: Queue<CuratedArticlesJob> | undefined;
};

// Constructed lazily — see the matching comment in search-index-queue.ts.
function getCuratedArticlesQueue(): Queue<CuratedArticlesJob> {
  if (!globalForCuratedArticlesQueue.curatedArticlesQueue) {
    globalForCuratedArticlesQueue.curatedArticlesQueue = new Queue<CuratedArticlesJob>(CURATED_ARTICLES_QUEUE_NAME, {
      connection: queueConnection,
    });
  }
  return globalForCuratedArticlesQueue.curatedArticlesQueue;
}

/** Registers the 6-hourly fetch — called once at scripts/worker.ts startup. */
export async function enqueueRepeatingCuratedArticlesFetch(): Promise<void> {
  await getCuratedArticlesQueue().add(
    "scheduled",
    { type: "scheduled" },
    { repeat: { every: REPEAT_INTERVAL_MS }, jobId: REPEAT_JOB_ID, removeOnComplete: true, removeOnFail: 50 },
  );
}

/** The admin's "Fetch now" — runs as soon as the worker picks it up, whether or not scheduled fetching is on. */
export async function enqueueManualCuratedArticlesFetch(sourceIds?: string[]): Promise<void> {
  await getCuratedArticlesQueue().add(
    "manual",
    { type: "manual", ...(sourceIds ? { sourceIds } : {}) },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}
