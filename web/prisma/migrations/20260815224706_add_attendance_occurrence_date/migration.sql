-- AlterTable: add nullable first (existing rows have no value yet)
ALTER TABLE "attendance" ADD COLUMN "occurrenceDate" TIMESTAMP(3);

-- Backfill: for every existing Attendance row, occurrenceDate = that
-- event's single startsAt (correct for every pre-existing row, since
-- EventRecurrence has never been wired up until this change — no
-- pre-existing Attendance row was ever for a "session" of a recurring
-- series).
UPDATE "attendance" AS a
SET "occurrenceDate" = e."startsAt"
FROM "events" AS e
WHERE e."id" = a."eventId";

-- Now safe to make it required.
ALTER TABLE "attendance" ALTER COLUMN "occurrenceDate" SET NOT NULL;

-- DropIndex: the old 2-column unique constraint.
DROP INDEX "attendance_eventId_userId_key";

-- CreateIndex: the new 3-column unique constraint.
CREATE UNIQUE INDEX "attendance_eventId_userId_occurrenceDate_key" ON "attendance"("eventId", "userId", "occurrenceDate");
