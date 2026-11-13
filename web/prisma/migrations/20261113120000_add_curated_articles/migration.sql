-- CreateEnum
CREATE TYPE "ArticleSourceKind" AS ENUM ('rss', 'news_search');

-- CreateEnum
CREATE TYPE "ExternalArticleStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "curatedArticleSourcesSeededAt" TIMESTAMP(3),
ADD COLUMN     "curatedArticlesFetchEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "forum_threads" ADD COLUMN     "externalArticleId" TEXT;

-- CreateTable
CREATE TABLE "article_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ArticleSourceKind" NOT NULL DEFAULT 'rss',
    "url" TEXT NOT NULL,
    "includeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "etag" TEXT,
    "lastModified" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastNewCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_source_communities" (
    "sourceId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,

    CONSTRAINT "article_source_communities_pkey" PRIMARY KEY ("sourceId","communityId")
);

-- CreateTable
CREATE TABLE "external_articles" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "imageKey" TEXT,
    "originalImageUrl" TEXT,
    "status" "ExternalArticleStatus" NOT NULL DEFAULT 'pending',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT,

    CONSTRAINT "external_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_article_communities" (
    "articleId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,

    CONSTRAINT "external_article_communities_pkey" PRIMARY KEY ("articleId","communityId")
);

-- CreateIndex
CREATE INDEX "article_source_communities_communityId_idx" ON "article_source_communities"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "external_articles_url_key" ON "external_articles"("url");

-- CreateIndex
CREATE INDEX "external_articles_status_approvedAt_idx" ON "external_articles"("status", "approvedAt");

-- CreateIndex
CREATE INDEX "external_articles_status_fetchedAt_idx" ON "external_articles"("status", "fetchedAt");

-- CreateIndex
CREATE INDEX "external_article_communities_communityId_idx" ON "external_article_communities"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "forum_threads_externalArticleId_key" ON "forum_threads"("externalArticleId");

-- AddForeignKey
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_externalArticleId_fkey" FOREIGN KEY ("externalArticleId") REFERENCES "external_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_source_communities" ADD CONSTRAINT "article_source_communities_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "article_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_source_communities" ADD CONSTRAINT "article_source_communities_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_articles" ADD CONSTRAINT "external_articles_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "article_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_article_communities" ADD CONSTRAINT "external_article_communities_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "external_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_article_communities" ADD CONSTRAINT "external_article_communities_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

