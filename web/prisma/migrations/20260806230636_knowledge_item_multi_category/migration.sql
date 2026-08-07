-- Knowledge Library items can belong to more than one category (§4.9).
-- Adds the knowledge_item_categories join table, backfills it from each
-- item's existing single categoryId, then drops that column/FK/index.

-- CreateTable
CREATE TABLE "knowledge_item_categories" (
    "knowledgeItemId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "knowledge_item_categories_pkey" PRIMARY KEY ("knowledgeItemId","categoryId")
);

-- CreateIndex
CREATE INDEX "knowledge_item_categories_categoryId_idx" ON "knowledge_item_categories"("categoryId");

-- AddForeignKey
ALTER TABLE "knowledge_item_categories" ADD CONSTRAINT "knowledge_item_categories_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_item_categories" ADD CONSTRAINT "knowledge_item_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "knowledge_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: each item's current category becomes its first entry.
INSERT INTO "knowledge_item_categories" ("knowledgeItemId", "categoryId")
SELECT "id", "categoryId" FROM "knowledge_items" WHERE "categoryId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "knowledge_items" DROP CONSTRAINT "knowledge_items_categoryId_fkey";

-- DropIndex
DROP INDEX "knowledge_items_categoryId_idx";

-- AlterTable
ALTER TABLE "knowledge_items" DROP COLUMN "categoryId";
