
-- AlterTable
ALTER TABLE "forum_threads" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "forum_threads_eventId_key" ON "forum_threads"("eventId");

-- AddForeignKey
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

