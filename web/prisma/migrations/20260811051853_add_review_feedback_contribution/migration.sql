-- AlterEnum
ALTER TYPE "ContributionSource" ADD VALUE 'review_feedback';

-- AlterTable
ALTER TABLE "contribution_events" ADD COLUMN     "reviewCommentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contribution_events_reviewCommentId_key" ON "contribution_events"("reviewCommentId");

-- AddForeignKey
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_reviewCommentId_fkey" FOREIGN KEY ("reviewCommentId") REFERENCES "review_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

