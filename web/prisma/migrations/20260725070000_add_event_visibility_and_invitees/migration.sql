
-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('community', 'invited');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'event_invited';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "visibility" "EventVisibility" NOT NULL DEFAULT 'community';

-- CreateTable
CREATE TABLE "event_invitees" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_invitees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_invitees_userId_idx" ON "event_invitees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "event_invitees_eventId_userId_key" ON "event_invitees"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "event_invitees" ADD CONSTRAINT "event_invitees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitees" ADD CONSTRAINT "event_invitees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

