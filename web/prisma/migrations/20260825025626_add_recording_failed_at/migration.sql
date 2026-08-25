-- AlterTable
ALTER TABLE "event_recordings" ADD COLUMN     "failedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "meeting_request_recordings" ADD COLUMN     "failedAt" TIMESTAMP(3),
ALTER COLUMN "objectKey" DROP NOT NULL;
