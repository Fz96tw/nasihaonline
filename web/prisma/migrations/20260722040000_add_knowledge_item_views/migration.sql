-- CreateTable
CREATE TABLE "knowledge_item_views" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_item_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_item_views_knowledgeItemId_userId_key" ON "knowledge_item_views"("knowledgeItemId", "userId");

-- AddForeignKey
ALTER TABLE "knowledge_item_views" ADD CONSTRAINT "knowledge_item_views_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_item_views" ADD CONSTRAINT "knowledge_item_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
