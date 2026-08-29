-- AlterTable
ALTER TABLE "forums" ADD COLUMN     "communityId" TEXT;

-- CreateTable
CREATE TABLE "forum_thread_categories" (
    "forumThreadId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "forum_thread_categories_pkey" PRIMARY KEY ("forumThreadId","categoryId")
);

-- CreateIndex
CREATE INDEX "forum_thread_categories_categoryId_idx" ON "forum_thread_categories"("categoryId");

-- AddForeignKey
ALTER TABLE "forums" ADD CONSTRAINT "forums_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_thread_categories" ADD CONSTRAINT "forum_thread_categories_forumThreadId_fkey" FOREIGN KEY ("forumThreadId") REFERENCES "forum_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_thread_categories" ADD CONSTRAINT "forum_thread_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "knowledge_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
