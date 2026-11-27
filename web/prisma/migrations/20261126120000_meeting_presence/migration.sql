-- CreateTable
CREATE TABLE "meeting_presences" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "participantSid" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "meeting_presences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_presences_participantSid_key" ON "meeting_presences"("participantSid");

-- CreateIndex
CREATE INDEX "meeting_presences_eventId_occurrenceDate_idx" ON "meeting_presences"("eventId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "meeting_presences" ADD CONSTRAINT "meeting_presences_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_presences" ADD CONSTRAINT "meeting_presences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

