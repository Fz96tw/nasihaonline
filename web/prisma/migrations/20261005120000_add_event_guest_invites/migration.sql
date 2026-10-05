-- CreateEnum
CREATE TYPE "EventRegistrationSource" AS ENUM ('public', 'invited', 'link');

-- AlterTable
ALTER TABLE "events" ADD COLUMN "guestLinkToken" TEXT;

-- AlterTable
ALTER TABLE "event_registrations"
    ADD COLUMN "source" "EventRegistrationSource" NOT NULL DEFAULT 'public',
    ADD COLUMN "invitedById" TEXT,
    ADD COLUMN "invitedAt" TIMESTAMP(3),
    ADD COLUMN "joinedAt" TIMESTAMP(3),
    ADD COLUMN "revokedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "events_guestLinkToken_key" ON "events"("guestLinkToken");

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
