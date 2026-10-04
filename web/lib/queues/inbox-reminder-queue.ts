// No "server-only" guard: scripts/worker.ts imports this module and runs
// outside Next's runtime — same convention as meeting-recording-sync-queue.ts.
import { Queue } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";

export const INBOX_REMINDER_QUEUE_NAME = "inbox-reminder";

export type InboxReminderJob = { type: "sweep" };

// Fixed jobId so re-registering the repeat schedule on every worker boot is
// idempotent rather than stacking a duplicate schedule per restart.
const REPEAT_JOB_ID = "inbox-reminder-sweep";
const REPEAT_INTERVAL_MS = 60 * 60 * 1000;

const globalForInboxReminderQueue = globalThis as unknown as {
  inboxReminderQueue: Queue<InboxReminderJob> | undefined;
};

// Constructed lazily — see the matching comment in search-index-queue.ts.
function getInboxReminderQueue(): Queue<InboxReminderJob> {
  if (!globalForInboxReminderQueue.inboxReminderQueue) {
    globalForInboxReminderQueue.inboxReminderQueue = new Queue<InboxReminderJob>(INBOX_REMINDER_QUEUE_NAME, {
      connection: queueConnection,
    });
  }
  return globalForInboxReminderQueue.inboxReminderQueue;
}

/** Registers the hourly unanswered-message sweep — called once at scripts/worker.ts startup. */
export async function enqueueRepeatingInboxReminderSweep(): Promise<void> {
  await getInboxReminderQueue().add(
    "sweep",
    { type: "sweep" },
    { repeat: { every: REPEAT_INTERVAL_MS }, jobId: REPEAT_JOB_ID, removeOnComplete: true, removeOnFail: 50 },
  );
}
