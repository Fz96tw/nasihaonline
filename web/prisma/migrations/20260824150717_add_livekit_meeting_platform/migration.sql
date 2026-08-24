-- CreateEnum
CREATE TYPE "MeetingPlatform" AS ENUM ('google_meet', 'livekit');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "livekitRoomName" TEXT;

-- AlterTable
ALTER TABLE "meeting_requests" ADD COLUMN     "livekitRoomName" TEXT,
ADD COLUMN     "meetingPlatform" "MeetingPlatform" NOT NULL DEFAULT 'google_meet';
