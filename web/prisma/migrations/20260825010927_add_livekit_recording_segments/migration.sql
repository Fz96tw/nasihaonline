-- CreateEnum
CREATE TYPE "RecordingOrigin" AS ENUM ('meet', 'livekit');

-- AlterTable: event_recordings gains a `livekit` origin alongside its
-- existing `meet` rows. The old one-row-per-occurrence unique index is
-- dropped (a livekit meeting can have multiple segment rows for the same
-- occurrence); Meet's own one-row-per-occurrence guarantee moves into
-- lib/meeting-recordings-sync.ts's own existence check instead.
DROP INDEX "event_recordings_eventId_occurrenceDate_key";
DROP INDEX "event_recordings_eventId_idx";

ALTER TABLE "event_recordings"
  ADD COLUMN "origin" "RecordingOrigin" NOT NULL DEFAULT 'meet',
  ADD COLUMN "objectKey" TEXT,
  ADD COLUMN "egressId" TEXT,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ALTER COLUMN "recordingUrl" DROP NOT NULL,
  ALTER COLUMN "driveFileId" DROP NOT NULL;

CREATE UNIQUE INDEX "event_recordings_egressId_key" ON "event_recordings"("egressId");
CREATE INDEX "event_recordings_eventId_occurrenceDate_idx" ON "event_recordings"("eventId", "occurrenceDate");

-- CreateTable
CREATE TABLE "meeting_request_recordings" (
    "id" TEXT NOT NULL,
    "meetingRequestId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "egressId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_request_recordings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meeting_request_recordings_egressId_key" ON "meeting_request_recordings"("egressId");
CREATE INDEX "meeting_request_recordings_meetingRequestId_idx" ON "meeting_request_recordings"("meetingRequestId");

ALTER TABLE "meeting_request_recordings" ADD CONSTRAINT "meeting_request_recordings_meetingRequestId_fkey" FOREIGN KEY ("meetingRequestId") REFERENCES "meeting_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
