-- AlterTable
ALTER TABLE "meeting_requests" ADD COLUMN     "recordingUrl" TEXT;

-- CreateTable
CREATE TABLE "event_recordings" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "recordingUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_recordings_eventId_idx" ON "event_recordings"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_recordings_eventId_occurrenceDate_key" ON "event_recordings"("eventId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "event_recordings" ADD CONSTRAINT "event_recordings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
