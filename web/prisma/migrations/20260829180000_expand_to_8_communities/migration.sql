-- Community-based-categorization initiative: expand the 6-community
-- taxonomy from migration 20260829174455 to the 8-community mapping
-- approved for objective 1. Renames 3 communities in place, splits the
-- old "Education & Humanities" community into "Education & Career" +
-- "Humanities" (reassigning its 3 existing categories), adds a new
-- "Nature & Outdoor" community, renames the existing "Science &
-- Philosophy" category to "Science" (its id is preserved, so existing
-- KnowledgeItemCategory/ReviewItemCategory tags are unaffected), and adds
-- 13 new categories plus the matching InterestArea enum values. No
-- existing member's Profile.interestAreas selections are lost: the
-- InterestArea enum value is renamed in place (RENAME VALUE), not
-- dropped/recreated.

-- Rename 3 existing communities to match the approved 8-group headers.
UPDATE "communities" SET "name" = 'Healthcare', "slug" = 'healthcare', "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Healthcare & Clinical';

UPDATE "communities" SET "name" = 'Sciences', "slug" = 'sciences', "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Science & Research';

UPDATE "communities" SET "name" = 'Technology', "slug" = 'technology', "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Technology & Data';

-- Add the 3 new communities (Education & Humanities is being split into
-- the first two of these; Nature & Outdoor is wholly new).
INSERT INTO "communities" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
    (gen_random_uuid()::text, 'Education & Career', 'education-career', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Humanities', 'humanities', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Nature & Outdoor', 'nature-outdoor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Reassign the 3 categories currently under "Education & Humanities"
-- before deleting that community.
UPDATE "knowledge_categories" kc SET "communityId" = c."id"
FROM "communities" c
WHERE c."name" = 'Education & Career' AND kc."name" = 'Education';

UPDATE "knowledge_categories" kc SET "communityId" = c."id"
FROM "communities" c
WHERE c."name" = 'Humanities' AND kc."name" IN ('History', 'Literature & Writing');

-- Now safe to remove the retired community (ON DELETE RESTRICT on
-- knowledge_categories.communityId means this fails loudly if any row
-- still points at it, i.e. the reassignment above was incomplete).
DELETE FROM "communities" WHERE "name" = 'Education & Humanities';

-- Rename "Science & Philosophy" to "Science" in place — same row id, so
-- existing Library/Review item tags on this category are unaffected.
UPDATE "knowledge_categories" SET "name" = 'Science', "slug" = 'science'
WHERE "name" = 'Science & Philosophy';

-- Mirror the same rename on the InterestArea enum so existing members who
-- had selected it keep a valid, equivalently-meaning selection.
ALTER TYPE "InterestArea" RENAME VALUE 'science_philosophy' TO 'science';

-- New InterestArea values for the 13 newly introduced categories.
ALTER TYPE "InterestArea" ADD VALUE 'health_fitness';
ALTER TYPE "InterestArea" ADD VALUE 'engineering';
ALTER TYPE "InterestArea" ADD VALUE 'psychology_sociology';
ALTER TYPE "InterestArea" ADD VALUE 'career_development';
ALTER TYPE "InterestArea" ADD VALUE 'law';
ALTER TYPE "InterestArea" ADD VALUE 'philosophy';
ALTER TYPE "InterestArea" ADD VALUE 'diy';
ALTER TYPE "InterestArea" ADD VALUE 'home_improvement_decor';
ALTER TYPE "InterestArea" ADD VALUE 'architecture';
ALTER TYPE "InterestArea" ADD VALUE 'photography';
ALTER TYPE "InterestArea" ADD VALUE 'camping_hiking';
ALTER TYPE "InterestArea" ADD VALUE 'fishing';
ALTER TYPE "InterestArea" ADD VALUE 'nature_wildlife';

-- The 13 new KnowledgeCategory rows, linked to their (possibly
-- just-renamed/just-created) community by name.
INSERT INTO "knowledge_categories" ("id", "name", "slug", "communityId", "createdAt")
SELECT gen_random_uuid()::text, v.name, v.slug, c."id", CURRENT_TIMESTAMP
FROM (VALUES
    ('Health & Fitness', 'health-fitness', 'Healthcare'),
    ('Engineering', 'engineering', 'Sciences'),
    ('Psychology & Sociology', 'psychology-sociology', 'Sciences'),
    ('Career Development', 'career-development', 'Education & Career'),
    ('Law', 'law', 'Humanities'),
    ('Philosophy', 'philosophy', 'Humanities'),
    ('DIY', 'diy', 'Arts, Culture & Lifestyle'),
    ('Home Improvement & Decor', 'home-improvement-decor', 'Arts, Culture & Lifestyle'),
    ('Architecture', 'architecture', 'Arts, Culture & Lifestyle'),
    ('Photography', 'photography', 'Arts, Culture & Lifestyle'),
    ('Camping & Hiking', 'camping-hiking', 'Nature & Outdoor'),
    ('Fishing', 'fishing', 'Nature & Outdoor'),
    ('Nature & Wildlife', 'nature-wildlife', 'Nature & Outdoor')
) AS v("name", "slug", "communityName")
JOIN "communities" c ON c."name" = v."communityName";
