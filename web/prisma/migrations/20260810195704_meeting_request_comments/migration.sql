-- AlterEnum
ALTER TYPE "MeetingRequestMessageAction" ADD VALUE 'commented';

-- AlterTable
ALTER TABLE "meeting_request_messages" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "meeting_request_messages_senderId_readAt_idx" ON "meeting_request_messages"("senderId", "readAt");
