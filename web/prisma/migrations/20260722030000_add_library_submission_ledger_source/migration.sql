-- AlterEnum
ALTER TYPE "ContributionSource" ADD VALUE 'library_submission';

-- AlterTable
ALTER TABLE "contribution_events" ADD COLUMN     "knowledgeItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contribution_events_knowledgeItemId_key" ON "contribution_events"("knowledgeItemId");

-- AddForeignKey
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
