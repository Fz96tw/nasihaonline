-- AlterTable
ALTER TABLE "membership_applications" ADD COLUMN     "sourcedFromDonation" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "careerStage" DROP NOT NULL;
