-- Community-based-categorization initiative, objective 1 (foundation).
-- Production-safe sequencing: knowledge_categories holds 22 real rows, so
-- communityId is added nullable, backfilled by name against the approved
-- mapping (mirrored in prisma/seed.ts as CATEGORY_COMMUNITY_MAP), then
-- tightened to NOT NULL. Zero data loss, no table rewrite mid-backfill.

-- CreateTable
CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communities_name_key" ON "communities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- Seed the 6 communities.
INSERT INTO "communities" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
    (gen_random_uuid()::text, 'Healthcare & Clinical', 'healthcare-clinical', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Science & Research', 'science-research', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Business & Finance', 'business-finance', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Technology & Data', 'technology-data', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Education & Humanities', 'education-humanities', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Arts, Culture & Lifestyle', 'arts-culture-lifestyle', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: add nullable first — table is not empty (22 rows).
ALTER TABLE "knowledge_categories" ADD COLUMN "communityId" TEXT;

-- Backfill existing categories per the approved mapping table.
UPDATE "knowledge_categories" kc SET "communityId" = c."id"
FROM "communities" c
WHERE c."name" = 'Healthcare & Clinical'
  AND kc."name" IN ('Healthcare', 'Health & Wellness', 'Health-tech', 'Clinical Research');

UPDATE "knowledge_categories" kc SET "communityId" = c."id"
FROM "communities" c
WHERE c."name" = 'Science & Research'
  AND kc."name" IN ('Basic Science Research', 'Biotechnology', 'Science & Philosophy', 'Sustainability & Environment');

UPDATE "knowledge_categories" kc SET "communityId" = c."id"
FROM "communities" c
WHERE c."name" = 'Business & Finance'
  AND kc."name" IN ('Business', 'Finance & Investing', 'Marketing & Sales', 'Leadership & Management');

UPDATE "knowledge_categories" kc SET "communityId" = c."id"
FROM "communities" c
WHERE c."name" = 'Technology & Data'
  AND kc."name" IN ('Tech & Development', 'Data & Analytics', 'E-Learning');

UPDATE "knowledge_categories" kc SET "communityId" = c."id"
FROM "communities" c
WHERE c."name" = 'Education & Humanities'
  AND kc."name" IN ('Education', 'History', 'Literature & Writing');

UPDATE "knowledge_categories" kc SET "communityId" = c."id"
FROM "communities" c
WHERE c."name" = 'Arts, Culture & Lifestyle'
  AND kc."name" IN ('Arts & Crafts', 'Music', 'Culinary Arts', 'Travel & Culture');

-- AlterTable: now that every row is backfilled, tighten to NOT NULL.
ALTER TABLE "knowledge_categories" ALTER COLUMN "communityId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "knowledge_categories_communityId_idx" ON "knowledge_categories"("communityId");

-- AddForeignKey
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
