-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "curatedArticleSourcesSeedVersion" INTEGER NOT NULL DEFAULT 0;


-- Environments seeded before batches existed already have batch 1.
UPDATE "site_settings" SET "curatedArticleSourcesSeedVersion" = 1 WHERE "curatedArticleSourcesSeededAt" IS NOT NULL;
