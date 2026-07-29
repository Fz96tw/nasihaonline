-- CreateEnum
CREATE TYPE "MeetingRequestMessageAction" AS ENUM ('created', 'proposed', 'accepted', 'declined', 'cancelled');

-- CreateTable
CREATE TABLE "meeting_request_messages" (
    "id" TEXT NOT NULL,
    "meetingRequestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "action" "MeetingRequestMessageAction" NOT NULL,
    "body" TEXT,
    "proposedTimes" TIMESTAMP(3)[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_request_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_request_messages_meetingRequestId_createdAt_idx" ON "meeting_request_messages"("meetingRequestId", "createdAt");

-- AddForeignKey
ALTER TABLE "meeting_request_messages" ADD CONSTRAINT "meeting_request_messages_meetingRequestId_fkey" FOREIGN KEY ("meetingRequestId") REFERENCES "meeting_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_request_messages" ADD CONSTRAINT "meeting_request_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: MeetingRequest.message used to be the single mutable field
-- carrying the negotiation's current note, silently overwritten on every
-- reschedule. Best-effort recovery — carry forward whatever it currently
-- holds as the thread's "created" entry before dropping the column; any
-- intermediate history already lost to that overwrite bug is not
-- recoverable (app hasn't launched yet, so this only affects a handful of
-- dev-seeded rows).
INSERT INTO "meeting_request_messages" ("id", "meetingRequestId", "senderId", "action", "body", "proposedTimes", "createdAt")
SELECT gen_random_uuid()::text, "id", "senderId", 'created', "message", "proposedTimes", "createdAt"
FROM "meeting_requests";

-- AlterTable
ALTER TABLE "meeting_requests" DROP COLUMN "message";
