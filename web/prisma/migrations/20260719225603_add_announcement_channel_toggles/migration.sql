-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sendEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showInFeed" BOOLEAN NOT NULL DEFAULT true;
