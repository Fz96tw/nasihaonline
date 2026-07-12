-- CreateEnum
CREATE TYPE "AdmissionPhase" AS ENUM ('founding_cohort', 'referral_driven_growth', 'open_applications');

-- CreateEnum
CREATE TYPE "CareerStage" AS ENUM ('expert', 'early_career', 'student');

-- CreateEnum
CREATE TYPE "ApplicationAvailability" AS ENUM ('virtual_meeting', 'in_person', 'online_review');

-- CreateEnum
CREATE TYPE "AreaOfInterest" AS ENUM ('healthcare', 'science', 'law', 'business', 'it');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('submitted', 'under_review', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "site_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "admissionPhase" "AdmissionPhase" NOT NULL DEFAULT 'referral_driven_growth',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_applications" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "professionalTitle" TEXT NOT NULL,
    "careerStage" "CareerStage" NOT NULL,
    "availability" "ApplicationAvailability" NOT NULL,
    "areaOfInterest" "AreaOfInterest" NOT NULL,
    "countryRegion" TEXT NOT NULL,
    "referral" TEXT,
    "whyJoin" TEXT NOT NULL,
    "expertiseToShare" TEXT NOT NULL,
    "topicsToLearn" TEXT NOT NULL,
    "professionalReferenceName" TEXT,
    "professionalReferenceContact" TEXT,
    "codeOfConductAcceptedAt" TIMESTAMP(3) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_applications_pkey" PRIMARY KEY ("id")
);
