-- Inbox group messages (PRD §4.7)
ALTER TYPE "NotificationType" ADD VALUE 'group_message';

ALTER TABLE "forum_threads" ADD COLUMN "isGroupMessage" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "thread_views" ADD COLUMN "lastReadAt" TIMESTAMP(3),
ADD COLUMN "lastEmailedAt" TIMESTAMP(3);
