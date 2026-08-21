// No "server-only" guard: scripts/worker.ts imports SEARCH_INDEX_QUEUE_NAME
// and SearchIndexSyncJob from this module and runs outside Next's runtime.
import { Queue } from "bullmq";
import { queueConnection } from "@/lib/queues/connection";

export const SEARCH_INDEX_QUEUE_NAME = "search-index-sync";

export type SearchIndexSyncJob =
  | { type: "profile"; userId: string }
  | { type: "knowledge"; knowledgeItemId: string }
  | { type: "forum"; threadId: string }
  | { type: "event"; eventId: string }
  | { type: "announcement"; announcementId: string }
  | { type: "survey"; surveyId: string }
  | { type: "reviewItem"; reviewItemId: string };

const globalForSearchIndexQueue = globalThis as unknown as {
  searchIndexQueue: Queue<SearchIndexSyncJob> | undefined;
};

// Constructed lazily, on first enqueue, rather than at module scope.
// BullMQ's Queue constructor probes the Redis server version as part of
// construction (RedisConnection.init()'s getRedisVersionAndType() call)
// regardless of the connection's lazyConnect setting, so a top-level `new
// Queue(...)` was enough to spam `next build`'s log with connection-refused
// retries just from this module being pulled into the build's module graph
// — before Redis is reachable, since REDIS_URL isn't passed as a build arg.
function getSearchIndexQueue(): Queue<SearchIndexSyncJob> {
  if (!globalForSearchIndexQueue.searchIndexQueue) {
    globalForSearchIndexQueue.searchIndexQueue = new Queue<SearchIndexSyncJob>(SEARCH_INDEX_QUEUE_NAME, {
      connection: queueConnection,
    });
  }
  return globalForSearchIndexQueue.searchIndexQueue;
}

/**
 * Called from every Profile write path (PATCH/avatar upload/avatar delete,
 * §4.3) so the Meilisearch index (§7.2) never drifts from Postgres. The
 * worker (scripts/worker.ts) re-derives directory eligibility from the DB
 * rather than trusting the job payload, so this only needs the userId.
 */
export async function enqueueProfileIndexSync(userId: string): Promise<void> {
  await getSearchIndexQueue().add(
    "profile-sync",
    { type: "profile", userId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}

/**
 * Called from POST /api/admin/library/:id/publish and POST /api/library/:id/flag
 * (§4.9) so the Meilisearch index (§7.2) never drifts from Postgres — same
 * DB-write → BullMQ → index-sync pattern as enqueueProfileIndexSync.
 */
export async function enqueueKnowledgeItemIndexSync(knowledgeItemId: string): Promise<void> {
  await getSearchIndexQueue().add(
    "knowledge-sync",
    { type: "knowledge", knowledgeItemId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}

/**
 * Called from POST /api/forums/:forumId/threads and POST /api/forums/threads/:threadId/posts
 * (§4.13) so the Meilisearch index (§7.2) never drifts from Postgres — same
 * DB-write → BullMQ → index-sync pattern as enqueueKnowledgeItemIndexSync.
 * A new reply re-syncs the same thread document rather than adding a
 * separate one, since ForumSearchDocument is one-per-thread.
 */
export async function enqueueForumThreadIndexSync(threadId: string): Promise<void> {
  await getSearchIndexQueue().add(
    "forum-sync",
    { type: "forum", threadId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}

/**
 * Called from POST /api/events, PATCH /api/events/:id, and POST
 * /api/events/:id/cancel — same DB-write → BullMQ → index-sync pattern as
 * enqueueForumThreadIndexSync. Not called from invitee-list routes: the
 * search index document carries no visibility/invitee data (per-viewer
 * authorization happens at query time, lib/search-server.ts), so an
 * invitee-list change never affects what's indexed.
 */
export async function enqueueEventIndexSync(eventId: string): Promise<void> {
  await getSearchIndexQueue().add(
    "event-sync",
    { type: "event", eventId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}

/**
 * Called from POST /api/admin/announcements and POST
 * /api/admin/announcements/:id/retract.
 */
export async function enqueueAnnouncementIndexSync(announcementId: string): Promise<void> {
  await getSearchIndexQueue().add(
    "announcement-sync",
    { type: "announcement", announcementId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}

/**
 * Called from lib/surveys-lifecycle.ts's openSurveyNow/autoCloseSurveyIfDue
 * (covers immediate-send, scheduled-open, and auto-close) and
 * lib/surveys-server.ts's closeSurvey/reopenSurvey (manual admin actions).
 */
export async function enqueueSurveyIndexSync(surveyId: string): Promise<void> {
  await getSearchIndexQueue().add(
    "survey-sync",
    { type: "survey", surveyId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}

/**
 * Called from every ReviewItem write path that can change its searchable
 * text or query-time eligibility (create/update/delete/close/reopen/
 * toggle-seeking) — not the invitees route, same "index carries no
 * invitee data" rationale as enqueueEventIndexSync.
 */
export async function enqueueReviewItemIndexSync(reviewItemId: string): Promise<void> {
  await getSearchIndexQueue().add(
    "review-item-sync",
    { type: "reviewItem", reviewItemId },
    { removeOnComplete: true, removeOnFail: 50 },
  );
}
