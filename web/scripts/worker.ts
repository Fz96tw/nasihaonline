import "dotenv/config";
import { Worker } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";
import { SEARCH_INDEX_QUEUE_NAME, type SearchIndexSyncJob } from "@/lib/queues/search-index-queue";
import { SURVEY_QUEUE_NAME, type SurveyJob } from "@/lib/queues/survey-queue";
import {
  ensureLibraryIndexConfigured,
  ensureProfilesIndexConfigured,
  ensureForumsIndexConfigured,
  ensureEventsIndexConfigured,
  ensureAnnouncementsIndexConfigured,
  ensureSurveysIndexConfigured,
  ensureReviewItemsIndexConfigured,
} from "@/lib/meilisearch";
import {
  syncKnowledgeItemToIndex,
  syncProfileToIndex,
  syncForumThreadToIndex,
  syncEventToIndex,
  syncAnnouncementToIndex,
  syncSurveyToIndex,
  syncReviewItemToIndex,
} from "@/lib/search-index-sync";
import { openSurveyNow, autoCloseSurveyIfDue } from "@/lib/surveys-lifecycle";

/**
 * Standalone process (`npm run worker`, docker-compose "worker" service) —
 * search-index sync deliberately never runs inline in a request handler
 * (§8's queue layer), so a slow/unavailable Meilisearch never blocks a
 * profile save.
 */
async function main() {
  await ensureProfilesIndexConfigured();
  await ensureLibraryIndexConfigured();
  await ensureForumsIndexConfigured();
  await ensureEventsIndexConfigured();
  await ensureAnnouncementsIndexConfigured();
  await ensureSurveysIndexConfigured();
  await ensureReviewItemsIndexConfigured();

  const worker = new Worker<SearchIndexSyncJob>(
    SEARCH_INDEX_QUEUE_NAME,
    async (job) => {
      if (job.data.type === "profile") {
        await syncProfileToIndex(job.data.userId);
      } else if (job.data.type === "knowledge") {
        await syncKnowledgeItemToIndex(job.data.knowledgeItemId);
      } else if (job.data.type === "forum") {
        await syncForumThreadToIndex(job.data.threadId);
      } else if (job.data.type === "event") {
        await syncEventToIndex(job.data.eventId);
      } else if (job.data.type === "announcement") {
        await syncAnnouncementToIndex(job.data.announcementId);
      } else if (job.data.type === "survey") {
        await syncSurveyToIndex(job.data.surveyId);
      } else if (job.data.type === "reviewItem") {
        await syncReviewItemToIndex(job.data.reviewItemId);
      }
    },
    { connection: queueConnection },
  );

  const SEARCH_INDEX_JOB_ID: Record<SearchIndexSyncJob["type"], (job: SearchIndexSyncJob) => string> = {
    profile: (job) => (job as { type: "profile"; userId: string }).userId,
    knowledge: (job) => (job as { type: "knowledge"; knowledgeItemId: string }).knowledgeItemId,
    forum: (job) => (job as { type: "forum"; threadId: string }).threadId,
    event: (job) => (job as { type: "event"; eventId: string }).eventId,
    announcement: (job) => (job as { type: "announcement"; announcementId: string }).announcementId,
    survey: (job) => (job as { type: "survey"; surveyId: string }).surveyId,
    reviewItem: (job) => (job as { type: "reviewItem"; reviewItemId: string }).reviewItemId,
  };

  worker.on("completed", (job) => {
    const id = SEARCH_INDEX_JOB_ID[job.data.type](job.data);
    console.log(`[search-index-worker] synced ${job.data.type} ${id}`);
  });
  worker.on("failed", (job, error) => {
    console.error(`[search-index-worker] failed job ${job?.id}:`, error);
  });

  console.log("[search-index-worker] listening for jobs on", SEARCH_INDEX_QUEUE_NAME);

  // Survey scheduled-open / auto-close (§ Surveys) — the first delayed
  // BullMQ jobs in this codebase. Runs in the same standalone worker
  // process as search-index sync rather than a second process, since both
  // are just "don't block a request handler on this" background work.
  const surveyWorker = new Worker<SurveyJob>(
    SURVEY_QUEUE_NAME,
    async (job) => {
      if (job.data.type === "open-survey") {
        await openSurveyNow(job.data.surveyId);
      } else if (job.data.type === "auto-close") {
        await autoCloseSurveyIfDue(job.data.surveyId, job.data.generation);
      }
    },
    { connection: queueConnection },
  );

  surveyWorker.on("completed", (job) => {
    console.log(`[survey-worker] completed ${job.data.type} for survey ${job.data.surveyId}`);
  });
  surveyWorker.on("failed", (job, error) => {
    console.error(`[survey-worker] failed job ${job?.id}:`, error);
  });

  console.log("[survey-worker] listening for jobs on", SURVEY_QUEUE_NAME);
}

main().catch((error) => {
  console.error("[search-index-worker] fatal error", error);
  process.exit(1);
});
