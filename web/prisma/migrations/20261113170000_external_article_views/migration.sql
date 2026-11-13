-- CreateTable
CREATE TABLE "external_article_views" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_article_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_article_views_articleId_userId_key" ON "external_article_views"("articleId", "userId");

-- AddForeignKey
ALTER TABLE "external_article_views" ADD CONSTRAINT "external_article_views_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "external_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_article_views" ADD CONSTRAINT "external_article_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

