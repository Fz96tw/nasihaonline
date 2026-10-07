-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "digestPeriodEnd" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "weeklyDigestLastFiredFor" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "announcements_digestPeriodEnd_key" ON "announcements"("digestPeriodEnd");
