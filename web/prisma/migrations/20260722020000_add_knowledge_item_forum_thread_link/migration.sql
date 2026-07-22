-- AlterTable
ALTER TABLE "forum_threads" ADD COLUMN     "knowledgeItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "forum_threads_knowledgeItemId_key" ON "forum_threads"("knowledgeItemId");

-- AddForeignKey
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
