-- CreateEnum
CREATE TYPE "InterestArea" AS ENUM ('arts_crafts', 'basic_science_research', 'biotechnology', 'business', 'clinical_research', 'culinary_arts', 'data_analytics', 'e_learning', 'education', 'engineering', 'finance_investing', 'government_public_policy', 'health_wellness', 'health_tech', 'healthcare', 'leadership_management', 'literature_writing', 'marketing_sales', 'nonprofit_social_impact', 'science_philosophy', 'sustainability_environment', 'tech_development', 'travel_culture');

-- AlterTable
ALTER TABLE "membership_applications" ADD COLUMN     "interestAreas" "InterestArea"[];

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "interestAreas" "InterestArea"[] DEFAULT ARRAY[]::"InterestArea"[];
