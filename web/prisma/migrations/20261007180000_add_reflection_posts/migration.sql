-- CreateTable
CREATE TABLE "reflection_posts" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "threadId" TEXT,
    "quoteId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflection_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reflection_posts_weekKey_key" ON "reflection_posts"("weekKey");

-- CreateIndex
CREATE UNIQUE INDEX "reflection_posts_threadId_key" ON "reflection_posts"("threadId");

-- CreateIndex
CREATE INDEX "reflection_posts_quoteId_idx" ON "reflection_posts"("quoteId");

-- AddForeignKey
ALTER TABLE "reflection_posts" ADD CONSTRAINT "reflection_posts_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "forum_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflection_posts" ADD CONSTRAINT "reflection_posts_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "reflection_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
