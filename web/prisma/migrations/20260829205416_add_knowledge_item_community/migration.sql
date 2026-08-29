-- CreateTable
CREATE TABLE "knowledge_item_communities" (
    "knowledgeItemId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,

    CONSTRAINT "knowledge_item_communities_pkey" PRIMARY KEY ("knowledgeItemId","communityId")
);

-- CreateIndex
CREATE INDEX "knowledge_item_communities_communityId_idx" ON "knowledge_item_communities"("communityId");

-- AddForeignKey
ALTER TABLE "knowledge_item_communities" ADD CONSTRAINT "knowledge_item_communities_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_item_communities" ADD CONSTRAINT "knowledge_item_communities_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing KnowledgeItem already has >=1 required category,
-- so its community is fully derivable from the union of its categories'
-- communities -- no "zero communities" legacy state, unlike Events.
INSERT INTO "knowledge_item_communities" ("knowledgeItemId", "communityId")
SELECT DISTINCT kic."knowledgeItemId", kc."communityId"
FROM "knowledge_item_categories" kic
JOIN "knowledge_categories" kc ON kic."categoryId" = kc."id"
ON CONFLICT DO NOTHING;
