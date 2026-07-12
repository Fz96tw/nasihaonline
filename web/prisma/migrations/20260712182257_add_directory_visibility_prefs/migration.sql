-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "listInDirectory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSpecialtyLocation" BOOLEAN NOT NULL DEFAULT true;
