-- AlterTable
ALTER TABLE "events" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- Backfill every pre-existing event as already-published (at its original
-- createdAt) — must happen in this same migration, before any application
-- code starts filtering listings on publishedAt IS NOT NULL, or every
-- existing event would read as a draft and vanish from public/member views.
UPDATE "events" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;

-- CreateIndex
CREATE INDEX "events_publishedAt_idx" ON "events"("publishedAt");
