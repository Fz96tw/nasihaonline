-- AlterTable
ALTER TABLE "events" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "knowledge_items" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "events_lastActivityAt_idx" ON "events"("lastActivityAt");

-- CreateIndex
CREATE INDEX "knowledge_items_lastActivityAt_idx" ON "knowledge_items"("lastActivityAt");

-- Backfill: each row starts at the feed's previous sort key for its type
-- (Event.createdAt; KnowledgeItem.publishedAt, falling back to createdAt),
-- or at its discussion thread's latest real post if that's later. A
-- thread's first post is the auto-created opening post (startEventDiscussion
-- / startLibraryDiscussion), not member activity, so it never counts.
UPDATE "events" e
   SET "lastActivityAt" = GREATEST(
         e."createdAt",
         COALESCE((
           SELECT max(p."createdAt")
             FROM "forum_posts" p
             JOIN "forum_threads" t ON t."id" = p."threadId"
            WHERE t."eventId" = e."id"
              AND p."createdAt" > (SELECT min(p2."createdAt") FROM "forum_posts" p2 WHERE p2."threadId" = t."id")
         ), e."createdAt")
       );

UPDATE "knowledge_items" k
   SET "lastActivityAt" = GREATEST(
         COALESCE(k."publishedAt", k."createdAt"),
         COALESCE((
           SELECT max(p."createdAt")
             FROM "forum_posts" p
             JOIN "forum_threads" t ON t."id" = p."threadId"
            WHERE t."knowledgeItemId" = k."id"
              AND p."createdAt" > (SELECT min(p2."createdAt") FROM "forum_posts" p2 WHERE p2."threadId" = t."id")
         ), COALESCE(k."publishedAt", k."createdAt"))
       );
