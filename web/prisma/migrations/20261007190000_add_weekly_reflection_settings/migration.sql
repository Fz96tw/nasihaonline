-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "weeklyReflectionDayOfWeek" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "weeklyReflectionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyReflectionHour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "weeklyReflectionNextQuoteId" TEXT;
