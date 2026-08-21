-- AlterTable: in-app waiting-room fields for Event.
ALTER TABLE "events" ADD COLUMN "meetingStartedAt" TIMESTAMP(3);
ALTER TABLE "events" ADD COLUMN "meetingOrganizerMessage" TEXT;
ALTER TABLE "events" ADD COLUMN "meetingOrganizerMessageImageKey" TEXT;

-- AlterTable: same fields for MeetingRequest.
ALTER TABLE "meeting_requests" ADD COLUMN "meetingStartedAt" TIMESTAMP(3);
ALTER TABLE "meeting_requests" ADD COLUMN "meetingOrganizerMessage" TEXT;
ALTER TABLE "meeting_requests" ADD COLUMN "meetingOrganizerMessageImageKey" TEXT;
