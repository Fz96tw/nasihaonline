-- CreateEnum
CREATE TYPE "HowHeardSource" AS ENUM ('online_search', 'colleague', 'member', 'other');

-- AlterTable
ALTER TABLE "membership_applications" ADD COLUMN     "howHeardMemberName" TEXT,
ADD COLUMN     "howHeardOtherDetail" TEXT,
ADD COLUMN     "howHeardSource" "HowHeardSource",
ADD COLUMN     "linkedinUrl" TEXT,
ALTER COLUMN "professionalTitle" DROP NOT NULL,
ALTER COLUMN "whyJoin" DROP NOT NULL,
ALTER COLUMN "expertiseToShare" DROP NOT NULL,
ALTER COLUMN "topicsToLearn" DROP NOT NULL;
