// No "server-only" guard: scripts/worker.ts imports this module and runs
// outside Next's runtime — same convention as inbox-reminder-queue.ts.
import { Queue } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";

export const WEEKLY_DIGEST_QUEUE_NAME = "weekly-digest";

export type WeeklyDigestJob = { type: "check" };

// Fixed jobId so re-registering the repeat schedule on every worker boot is
// idempotent rather than stacking a duplicate schedule per restart.
const REPEAT_JOB_ID = "weekly-digest-check";
// A frequent check, not a weekly cron: lib/weekly-digest-job.ts decides on
// each tick whether the configured day/hour has arrived, reading the admin
// settings fresh, so changing them needs no redeploy or re-registration.
const REPEAT_INTERVAL_MS = 15 * 60 * 1000;

const globalForWeeklyDigestQueue = globalThis as unknown as {
  weeklyDigestQueue: Queue<WeeklyDigestJob> | undefined;
};

// Constructed lazily — see the matching comment in search-index-queue.ts.
function getWeeklyDigestQueue(): Queue<WeeklyDigestJob> {
  if (!globalForWeeklyDigestQueue.weeklyDigestQueue) {
    globalForWeeklyDigestQueue.weeklyDigestQueue = new Queue<WeeklyDigestJob>(WEEKLY_DIGEST_QUEUE_NAME, {
      connection: queueConnection,
    });
  }
  return globalForWeeklyDigestQueue.weeklyDigestQueue;
}

/** Registers the 15-minute weekly-digest check — called once at scripts/worker.ts startup. */
export async function enqueueRepeatingWeeklyDigestCheck(): Promise<void> {
  await getWeeklyDigestQueue().add(
    "check",
    { type: "check" },
    { repeat: { every: REPEAT_INTERVAL_MS }, jobId: REPEAT_JOB_ID, removeOnComplete: true, removeOnFail: 50 },
  );
}
