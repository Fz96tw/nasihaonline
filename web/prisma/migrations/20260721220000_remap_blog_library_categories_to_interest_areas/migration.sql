-- Blog/Library categories move from the old medical-specialty seed list
-- (Cardiology/Oncology/Global Health/Research/Mental Health/Education) to
-- the same broad InterestArea labels used for member/application interest
-- tagging (§3.3/§4.3) -- the platform is no longer medical-only, so the old
-- names are a stale default. `prisma/seed.ts` now seeds POST_CATEGORIES and
-- KNOWLEDGE_CATEGORIES from INTEREST_AREA_LABELS; this migration remaps any
-- rows a prior seed run already created, merging Cardiology/Global
-- Health/Oncology into a single "Healthcare" row (folding their posts/items
-- onto it) and renaming Research -> "Clinical Research" and Mental Health ->
-- "Health & Wellness" in place. Education is unchanged -- both lists
-- already agree on that name.

DO $$
DECLARE
  healthcare_id TEXT;
BEGIN
  -- post_categories / posts
  SELECT id INTO healthcare_id FROM "post_categories" WHERE name = 'Healthcare';
  IF healthcare_id IS NULL THEN
    SELECT id INTO healthcare_id FROM "post_categories" WHERE name = 'Cardiology';
    IF healthcare_id IS NOT NULL THEN
      UPDATE "post_categories" SET name = 'Healthcare', slug = 'healthcare' WHERE id = healthcare_id;
    END IF;
  END IF;
  IF healthcare_id IS NOT NULL THEN
    UPDATE "posts" SET "categoryId" = healthcare_id
      WHERE "categoryId" IN (SELECT id FROM "post_categories" WHERE name IN ('Global Health', 'Oncology'));
    DELETE FROM "post_categories" WHERE name IN ('Global Health', 'Oncology') AND id != healthcare_id;
  END IF;

  -- knowledge_categories / knowledge_items
  healthcare_id := NULL;
  SELECT id INTO healthcare_id FROM "knowledge_categories" WHERE name = 'Healthcare';
  IF healthcare_id IS NULL THEN
    SELECT id INTO healthcare_id FROM "knowledge_categories" WHERE name = 'Cardiology';
    IF healthcare_id IS NOT NULL THEN
      UPDATE "knowledge_categories" SET name = 'Healthcare', slug = 'healthcare' WHERE id = healthcare_id;
    END IF;
  END IF;
  IF healthcare_id IS NOT NULL THEN
    UPDATE "knowledge_items" SET "categoryId" = healthcare_id
      WHERE "categoryId" IN (SELECT id FROM "knowledge_categories" WHERE name IN ('Global Health', 'Oncology'));
    DELETE FROM "knowledge_categories" WHERE name IN ('Global Health', 'Oncology') AND id != healthcare_id;
  END IF;
END $$;

-- Research -> Clinical Research (1:1 rename, no merge needed)
UPDATE "post_categories" SET name = 'Clinical Research', slug = 'clinical-research' WHERE name = 'Research';
UPDATE "knowledge_categories" SET name = 'Clinical Research', slug = 'clinical-research' WHERE name = 'Research';

-- Mental Health -> Health & Wellness (1:1 rename, no merge needed)
UPDATE "post_categories" SET name = 'Health & Wellness', slug = 'health-wellness' WHERE name = 'Mental Health';
UPDATE "knowledge_categories" SET name = 'Health & Wellness', slug = 'health-wellness' WHERE name = 'Mental Health';
