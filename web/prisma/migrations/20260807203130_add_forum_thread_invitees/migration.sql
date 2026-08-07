-- CreateEnum
CREATE TYPE "ForumThreadVisibility" AS ENUM ('community', 'invited');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'forum_thread_invited';
ALTER TYPE "NotificationType" ADD VALUE 'forum_thread_removed';

-- AlterTable
ALTER TABLE "forum_threads" ADD COLUMN     "visibility" "ForumThreadVisibility" NOT NULL DEFAULT 'community';

-- CreateTable
CREATE TABLE "forum_thread_invitees" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forum_thread_invitees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forum_thread_invitees_userId_idx" ON "forum_thread_invitees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "forum_thread_invitees_threadId_userId_key" ON "forum_thread_invitees"("threadId", "userId");

-- AddForeignKey
ALTER TABLE "forum_thread_invitees" ADD CONSTRAINT "forum_thread_invitees_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "forum_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_thread_invitees" ADD CONSTRAINT "forum_thread_invitees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
