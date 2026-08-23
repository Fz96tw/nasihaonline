-- AlterTable
ALTER TABLE "event_recordings" ADD COLUMN     "driveFileId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "meeting_requests" ADD COLUMN     "driveFileId" TEXT;
