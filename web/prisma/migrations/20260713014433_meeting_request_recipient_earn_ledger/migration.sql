-- AlterTable
ALTER TABLE "meeting_requests" ADD COLUMN     "recipientContributionLedgerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "meeting_requests_recipientContributionLedgerId_key" ON "meeting_requests"("recipientContributionLedgerId");

-- AddForeignKey
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_recipientContributionLedgerId_fkey" FOREIGN KEY ("recipientContributionLedgerId") REFERENCES "contribution_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
