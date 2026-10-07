-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('weekly', 'biweekly', 'monthly');

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "weeklyDigestFrequency" "DigestFrequency" NOT NULL DEFAULT 'weekly';
