import "dotenv/config";
import { Worker } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";
import { SEARCH_INDEX_QUEUE_NAME, type SearchIndexSyncJob } from "@/lib/queues/search-index-queue";
import { SURVEY_QUEUE_NAME, type SurveyJob } from "@/lib/queues/survey-queue";
import {
  ensureLibraryIndexConfigured,
  ensurePostsIndexConfigured,
  ensureProfilesIndexConfigured,
  ensureForumsIndexConfigured,
} from "@/lib/meilisearch";
import {
  syncKnowledgeItemToIndex,
  syncPostToIndex,
  syncProfileToIndex,
  syncForumThreadToIndex,
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
  await ensurePostsIndexConfigured();
  await ensureLibraryIndexConfigured();
  await ensureForumsIndexConfigured();

  const worker = new Worker<SearchIndexSyncJob>(
    SEARCH_INDEX_QUEUE_NAME,
    async (job) => {
      if (job.data.type === "profile") {
        await syncProfileToIndex(job.data.userId);
      } else if (job.data.type === "post") {
        await syncPostToIndex(job.data.postId);
      } else if (job.data.type === "knowledge") {
        await syncKnowledgeItemToIndex(job.data.knowledgeItemId);
      } else if (job.data.type === "forum") {
        await syncForumThreadToIndex(job.data.threadId);
      }
    },
    { connection: queueConnection },
  );

  worker.on("completed", (job) => {
    const id =
      job.data.type === "profile"
        ? job.data.userId
        : job.data.type === "post"
          ? job.data.postId
          : job.data.type === "knowledge"
            ? job.data.knowledgeItemId
            : job.data.threadId;
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
