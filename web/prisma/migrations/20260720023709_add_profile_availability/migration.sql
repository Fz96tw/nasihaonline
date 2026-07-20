-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "availability" "ApplicationAvailability"[] DEFAULT ARRAY[]::"ApplicationAvailability"[];
