-- AlterTable
ALTER TABLE "meeting_requests" ADD COLUMN "scheduledAt" TIMESTAMP(3),
ADD COLUMN "meetingUrl" TEXT,
ADD COLUMN "googleEventId" TEXT;
