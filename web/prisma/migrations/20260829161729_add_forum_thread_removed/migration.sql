-- AlterTable
ALTER TABLE "forum_threads" ADD COLUMN     "removed" BOOLEAN NOT NULL DEFAULT false;

-- RenameIndex
ALTER INDEX "meeting_request_chat_messages_meetingRequestId_livekitMess_key" RENAME TO "meeting_request_chat_messages_meetingRequestId_livekitMessa_key";
