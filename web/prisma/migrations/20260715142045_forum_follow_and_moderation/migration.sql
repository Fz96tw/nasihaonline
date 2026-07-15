-- AlterTable
ALTER TABLE "forum_posts" ADD COLUMN     "deidentificationConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "forum_follows" (
    "id" TEXT NOT NULL,
    "forumId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forum_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forum_follows_userId_idx" ON "forum_follows"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "forum_follows_forumId_userId_key" ON "forum_follows"("forumId", "userId");

-- AddForeignKey
ALTER TABLE "forum_follows" ADD CONSTRAINT "forum_follows_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "forums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_follows" ADD CONSTRAINT "forum_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
