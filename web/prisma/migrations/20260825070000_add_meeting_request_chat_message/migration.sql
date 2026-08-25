-- AlterEnum
ALTER TYPE "MeetingRequestMessageAction" ADD VALUE 'chat_transcript';

-- CreateTable
CREATE TABLE "meeting_request_chat_messages" (
    "id" TEXT NOT NULL,
    "meetingRequestId" TEXT NOT NULL,
    "livekitMessageId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_request_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_request_chat_messages_meetingRequestId_livekitMess_key" ON "meeting_request_chat_messages"("meetingRequestId", "livekitMessageId");

-- CreateIndex
CREATE INDEX "meeting_request_chat_messages_meetingRequestId_idx" ON "meeting_request_chat_messages"("meetingRequestId");

-- AddForeignKey
ALTER TABLE "meeting_request_chat_messages" ADD CONSTRAINT "meeting_request_chat_messages_meetingRequestId_fkey" FOREIGN KEY ("meetingRequestId") REFERENCES "meeting_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
