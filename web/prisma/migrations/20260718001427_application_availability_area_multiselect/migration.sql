/*
  Warnings:

  - Changed the column `availability` on the `membership_applications` table from a scalar field to a list field. Existing values are wrapped in a single-element array to preserve data.
  - Changed the column `areaOfInterest` on the `membership_applications` table from a scalar field to a list field. Existing values are wrapped in a single-element array to preserve data.

*/
-- AlterTable
ALTER TABLE "membership_applications"
ALTER COLUMN "availability" TYPE "ApplicationAvailability"[] USING ARRAY["availability"]::"ApplicationAvailability"[],
ALTER COLUMN "areaOfInterest" TYPE "AreaOfInterest"[] USING ARRAY["areaOfInterest"]::"AreaOfInterest"[];
