-- CreateEnum
CREATE TYPE "RecordingOwnerType" AS ENUM ('forum_post', 'inbox_message', 'review_comment');

-- AlterTable
ALTER TABLE "meeting_request_recordings" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "forumPostId" TEXT,
ADD COLUMN     "inboxMessageId" TEXT,
ADD COLUMN     "ownerType" "RecordingOwnerType",
ADD COLUMN     "reviewCommentId" TEXT;

-- CreateIndex
CREATE INDEX "meeting_request_recordings_forumPostId_idx" ON "meeting_request_recordings"("forumPostId");

-- CreateIndex
CREATE INDEX "meeting_request_recordings_inboxMessageId_idx" ON "meeting_request_recordings"("inboxMessageId");

-- CreateIndex
CREATE INDEX "meeting_request_recordings_reviewCommentId_idx" ON "meeting_request_recordings"("reviewCommentId");
