-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "announcementEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eventAnnouncementEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
