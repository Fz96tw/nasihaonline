// No "server-only" guard: scripts/worker.ts imports SURVEY_QUEUE_NAME and
// SurveyJob from this module and runs outside Next's runtime — same
// convention as lib/queues/search-index-queue.ts.
import { Queue } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";

export const SURVEY_QUEUE_NAME = "survey-lifecycle";

/**
 * The first delayed (non-immediate) BullMQ jobs in this codebase.
 * `generation` is carried on both job types so the worker can no-op a job
 * queued before an admin closed/reopened the survey out from under it —
 * see Survey.generation in schema.prisma.
 */
export type SurveyJob =
  | { type: "open-survey"; surveyId: string; generation: number }
  | { type: "auto-close"; surveyId: string; generation: number };

const globalForSurveyQueue = globalThis as unknown as {
  surveyQueue: Queue<SurveyJob> | undefined;
};

// Constructed lazily — see the matching comment in search-index-queue.ts for
// why a top-level `new Queue(...)` spams `next build`'s log with
// connection-refused retries.
function getSurveyQueue(): Queue<SurveyJob> {
  if (!globalForSurveyQueue.surveyQueue) {
    globalForSurveyQueue.surveyQueue = new Queue<SurveyJob>(SURVEY_QUEUE_NAME, { connection: queueConnection });
  }
  return globalForSurveyQueue.surveyQueue;
}

/**
 * Queued when an admin schedules a survey for a future `scheduledStartAt`
 * (§ compose flow). Fires resolveSurveyAudience + the invite email fan-out
 * at the scheduled time, from the worker process — never inline in a
 * request handler, so a large audience resolution/send never blocks the
 * admin's request.
 */
export async function enqueueOpenSurvey(surveyId: string, generation: number, openAt: Date): Promise<void> {
  const delay = Math.max(0, openAt.getTime() - Date.now());
  await getSurveyQueue().add(
    "open-survey",
    { type: "open-survey", surveyId, generation },
    { delay, removeOnComplete: true, removeOnFail: 50 },
  );
}

/**
 * Queued whenever a survey becomes open with a `durationDays` set (on
 * immediate send, on the delayed open-survey job firing, or on manual
 * reopen with a new duration). The worker checks Survey.generation still
 * matches before closing, so a stale job from before a reopen is a no-op.
 */
export async function enqueueAutoClose(surveyId: string, generation: number, closeAt: Date): Promise<void> {
  const delay = Math.max(0, closeAt.getTime() - Date.now());
  await getSurveyQueue().add(
    "auto-close",
    { type: "auto-close", surveyId, generation },
    { delay, removeOnComplete: true, removeOnFail: 50 },
  );
}
