-- AlterTable
ALTER TABLE "knowledge_items" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- Backfill: use updatedAt as best-available proxy for when existing
-- published/flagged items were approved (updatedAt was touched on that
-- status transition even if the field wasn't set at the time).
UPDATE "knowledge_items"
SET "publishedAt" = "updatedAt"
WHERE "status" IN ('published', 'flagged');
