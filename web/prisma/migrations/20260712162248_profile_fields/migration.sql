-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "careerStage" TEXT,
ADD COLUMN     "countryRegion" TEXT,
ADD COLUMN     "expertiseAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "learningTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "titleSpecialty" TEXT;
