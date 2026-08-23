// No "server-only" guard: scripts/worker.ts imports this module and runs
// outside Next's runtime — same convention as search-index-queue.ts.
import { Queue } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";

export const MEETING_RECORDING_SYNC_QUEUE_NAME = "meeting-recording-sync";

export type MeetingRecordingSyncJob = { type: "sync" };

// Fixed jobId so re-registering the repeat schedule on every worker boot is
// idempotent (BullMQ dedupes a repeatable job by jobId + repeat pattern)
// rather than stacking a duplicate schedule per restart.
const REPEAT_JOB_ID = "meeting-recordings-sync";
const REPEAT_INTERVAL_MS = 15 * 60 * 1000;

const globalForMeetingRecordingSyncQueue = globalThis as unknown as {
  meetingRecordingSyncQueue: Queue<MeetingRecordingSyncJob> | undefined;
};

// Constructed lazily — see the matching comment in search-index-queue.ts for
// why a top-level `new Queue(...)` spams `next build`'s log with
// connection-refused retries.
function getMeetingRecordingSyncQueue(): Queue<MeetingRecordingSyncJob> {
  if (!globalForMeetingRecordingSyncQueue.meetingRecordingSyncQueue) {
    globalForMeetingRecordingSyncQueue.meetingRecordingSyncQueue = new Queue<MeetingRecordingSyncJob>(
      MEETING_RECORDING_SYNC_QUEUE_NAME,
      { connection: queueConnection },
    );
  }
  return globalForMeetingRecordingSyncQueue.meetingRecordingSyncQueue;
}

/**
 * Registers the repeating meeting-recordings sweep (lib/meeting-recordings-sync.ts)
 * — called once at scripts/worker.ts startup, not from any request handler.
 */
export async function enqueueRepeatingMeetingRecordingsSync(): Promise<void> {
  await getMeetingRecordingSyncQueue().add(
    "sync",
    { type: "sync" },
    { repeat: { every: REPEAT_INTERVAL_MS }, jobId: REPEAT_JOB_ID, removeOnComplete: true, removeOnFail: 50 },
  );
}
