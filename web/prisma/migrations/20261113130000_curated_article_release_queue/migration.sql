-- AlterEnum
ALTER TYPE "ExternalArticleStatus" ADD VALUE 'scheduled';

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "curatedArticlesPerCommunityPerWeek" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "external_articles" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "external_articles_status_scheduledAt_idx" ON "external_articles"("status", "scheduledAt");

