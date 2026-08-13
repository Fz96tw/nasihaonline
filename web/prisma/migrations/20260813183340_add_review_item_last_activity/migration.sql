-- AlterTable
ALTER TABLE "review_items" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing rows to their own createdAt rather than leaving them at
-- the migration's run time (Postgres evaluates a just-added column's DEFAULT
-- as "now" for pre-existing rows) — otherwise every review item that
-- predates this migration would wrongly jump to the top of the What's New
-- feed the moment this deploys, even though nothing about its audience
-- actually changed.
UPDATE "review_items" SET "lastActivityAt" = "createdAt";
