-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "inviteToJoin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "membership_applications" ADD COLUMN     "referredByUserId" TEXT,
ADD COLUMN     "referredViaEventId" TEXT;

-- CreateIndex
CREATE INDEX "membership_applications_referredByUserId_idx" ON "membership_applications"("referredByUserId");

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_referredViaEventId_fkey" FOREIGN KEY ("referredViaEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
