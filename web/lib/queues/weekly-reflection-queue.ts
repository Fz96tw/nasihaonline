// No "server-only" guard: scripts/worker.ts imports this module and runs
// outside Next's runtime — same convention as weekly-digest-queue.ts.
import { Queue } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";

export const WEEKLY_REFLECTION_QUEUE_NAME = "weekly-reflection";

export type WeeklyReflectionJob = { type: "check" };

// Fixed jobId so re-registering the repeat schedule on every worker boot is
// idempotent rather than stacking a duplicate schedule per restart.
const REPEAT_JOB_ID = "weekly-reflection-check";
// A frequent check, not a weekly cron: lib/weekly-reflection-job.ts decides on
// each tick whether the configured day/hour has arrived, so changing the
// schedule needs no redeploy or re-registration. The posting itself is
// idempotent per ISO week, so the extra ticks are harmless.
const REPEAT_INTERVAL_MS = 15 * 60 * 1000;

const globalForWeeklyReflectionQueue = globalThis as unknown as {
  weeklyReflectionQueue: Queue<WeeklyReflectionJob> | undefined;
};

// Constructed lazily — see the matching comment in search-index-queue.ts.
function getWeeklyReflectionQueue(): Queue<WeeklyReflectionJob> {
  if (!globalForWeeklyReflectionQueue.weeklyReflectionQueue) {
    globalForWeeklyReflectionQueue.weeklyReflectionQueue = new Queue<WeeklyReflectionJob>(WEEKLY_REFLECTION_QUEUE_NAME, {
      connection: queueConnection,
    });
  }
  return globalForWeeklyReflectionQueue.weeklyReflectionQueue;
}

/** Registers the 15-minute weekly-reflection check — called once at scripts/worker.ts startup. */
export async function enqueueRepeatingWeeklyReflectionCheck(): Promise<void> {
  await getWeeklyReflectionQueue().add(
    "check",
    { type: "check" },
    { repeat: { every: REPEAT_INTERVAL_MS }, jobId: REPEAT_JOB_ID, removeOnComplete: true, removeOnFail: 50 },
  );
}
