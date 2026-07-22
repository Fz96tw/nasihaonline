-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "welcomeAnnouncementEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "welcomeAnnouncementInFeed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "welcomeAnnouncementNotify" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "welcomeAnnouncementSentAt" TIMESTAMP(3);
