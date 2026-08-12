-- AlterTable
ALTER TABLE "forum_threads" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing threads to their true last activity (latest reply, or
-- the thread's own createdAt if it has no replies yet) instead of leaving
-- every pre-existing thread defaulted to "now".
UPDATE "forum_threads" t
SET "lastActivityAt" = COALESCE(
  (SELECT MAX(p."createdAt") FROM "forum_posts" p WHERE p."threadId" = t."id"),
  t."createdAt"
);
