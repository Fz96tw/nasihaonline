-- CreateEnum
CREATE TYPE "MeetingRequestOrigin" AS ENUM ('directory', 'quick_recording');

-- AlterTable
ALTER TABLE "meeting_requests" ADD COLUMN     "origin" "MeetingRequestOrigin" NOT NULL DEFAULT 'directory';

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "quickRecordingMaxDurationSeconds" INTEGER NOT NULL DEFAULT 30;
