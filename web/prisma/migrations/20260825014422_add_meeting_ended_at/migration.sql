-- AlterTable
ALTER TABLE "events" ADD COLUMN     "meetingEndedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "meeting_requests" ADD COLUMN     "meetingEndedAt" TIMESTAMP(3);
