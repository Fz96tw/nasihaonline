-- Drop the old, narrower AreaOfInterest field + enum (consolidated into
-- the single InterestArea list). This is a destructive change: existing
-- membership_applications.areaOfInterest values are lost.
ALTER TABLE "membership_applications" DROP COLUMN "areaOfInterest";
DROP TYPE "AreaOfInterest";

-- Trim InterestArea: remove engineering / government_public_policy /
-- nonprofit_social_impact (unused in the DB — verified before writing
-- this migration). Postgres has no DROP VALUE for enums, so recreate.
ALTER TABLE "profiles" ALTER COLUMN "interestAreas" DROP DEFAULT;

CREATE TYPE "InterestArea_new" AS ENUM ('arts_crafts', 'basic_science_research', 'biotechnology', 'business', 'clinical_research', 'culinary_arts', 'data_analytics', 'e_learning', 'education', 'finance_investing', 'health_wellness', 'health_tech', 'healthcare', 'leadership_management', 'literature_writing', 'marketing_sales', 'science_philosophy', 'sustainability_environment', 'tech_development', 'travel_culture');

ALTER TABLE "membership_applications" ALTER COLUMN "interestAreas" TYPE "InterestArea_new"[] USING ("interestAreas"::text[]::"InterestArea_new"[]);
ALTER TABLE "profiles" ALTER COLUMN "interestAreas" TYPE "InterestArea_new"[] USING ("interestAreas"::text[]::"InterestArea_new"[]);

DROP TYPE "InterestArea";
ALTER TYPE "InterestArea_new" RENAME TO "InterestArea";

ALTER TABLE "profiles" ALTER COLUMN "interestAreas" SET DEFAULT ARRAY[]::"InterestArea"[];
