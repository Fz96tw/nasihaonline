-- AlterTable
ALTER TABLE "post_comments" ADD COLUMN     "flagReason" TEXT,
ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "removed" BOOLEAN NOT NULL DEFAULT false;
