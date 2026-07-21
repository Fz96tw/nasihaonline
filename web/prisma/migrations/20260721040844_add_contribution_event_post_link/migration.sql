-- AlterTable
ALTER TABLE "contribution_events" ADD COLUMN     "postId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contribution_events_postId_key" ON "contribution_events"("postId");

-- AddForeignKey
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
