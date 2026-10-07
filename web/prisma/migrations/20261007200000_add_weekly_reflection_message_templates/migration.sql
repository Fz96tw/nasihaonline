-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "weeklyReflectionBodyTemplate" TEXT NOT NULL DEFAULT '{prompt}

“{quote}”
— {attribution}',
ADD COLUMN     "weeklyReflectionTitleTemplate" TEXT NOT NULL DEFAULT 'Weekly Reflection: “{quote}”';
