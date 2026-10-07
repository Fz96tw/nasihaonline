-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "weeklyReflectionBodyTemplate" TEXT NOT NULL DEFAULT '“{quote}”
— {attribution}

{prompt}',
ADD COLUMN     "weeklyReflectionTitleTemplate" TEXT NOT NULL DEFAULT 'Weekly Reflection: week of {weekOf}';

