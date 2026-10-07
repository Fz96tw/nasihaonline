-- AlterTable
ALTER TABLE "users" ADD COLUMN     "digestEmailOptedOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "digestEmailsSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastDigestEmailAt" TIMESTAMP(3),
ADD COLUMN     "digestUnsubscribeToken" TEXT;

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "digestHighlights" JSONB,
ADD COLUMN     "digestEmailsSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "weeklyDigestEmailSubject" TEXT NOT NULL DEFAULT 'See what''s been happening at NASIHA',
ADD COLUMN     "weeklyDigestEmailIntro" TEXT NOT NULL DEFAULT 'Hi {firstName}, it''s been a little while, and we''ve missed you. Here''s a look at what''s happened in the community recently.';

-- CreateIndex
CREATE UNIQUE INDEX "users_digestUnsubscribeToken_key" ON "users"("digestUnsubscribeToken");
