-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('pending_review', 'published', 'flagged', 'rejected');

-- CreateEnum
CREATE TYPE "KnowledgeContentType" AS ENUM ('recorded_lecture', 'article', 'case_study', 'guideline');

-- CreateEnum
CREATE TYPE "KnowledgeLevel" AS ENUM ('student_friendly', 'early_career', 'advanced', 'all_levels');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'blog_comment';
ALTER TYPE "NotificationType" ADD VALUE 'forum_reply_mention';
ALTER TYPE "NotificationType" ADD VALUE 'resource_review_update';

-- CreateTable
CREATE TABLE "post_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags_on_posts" (
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "post_tags_on_posts_pkey" PRIMARY KEY ("postId","tagId")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "heroImageUrl" TEXT,
    "licenseConsented" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "knowledge_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_item_tags" (
    "knowledgeItemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "knowledge_item_tags_pkey" PRIMARY KEY ("knowledgeItemId","tagId")
);

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contentType" "KnowledgeContentType" NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'pending_review',
    "level" "KnowledgeLevel" NOT NULL,
    "contributorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "youtubeUrl" TEXT,
    "deidentificationConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "licenseConsented" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_attachments" (
    "id" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forums" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_threads" (
    "id" TEXT NOT NULL,
    "forumId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_posts" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_name_key" ON "post_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "post_categories_slug_key" ON "post_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "post_tags_name_key" ON "post_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "post_tags_slug_key" ON "post_tags"("slug");

-- CreateIndex
CREATE INDEX "post_tags_on_posts_tagId_idx" ON "post_tags_on_posts"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");

-- CreateIndex
CREATE INDEX "posts_categoryId_idx" ON "posts"("categoryId");

-- CreateIndex
CREATE INDEX "posts_publishedAt_idx" ON "posts"("publishedAt");

-- CreateIndex
CREATE INDEX "post_comments_postId_idx" ON "post_comments"("postId");

-- CreateIndex
CREATE INDEX "post_comments_parentId_idx" ON "post_comments"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_categories_name_key" ON "knowledge_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_categories_slug_key" ON "knowledge_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_tags_name_key" ON "knowledge_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_tags_slug_key" ON "knowledge_tags"("slug");

-- CreateIndex
CREATE INDEX "knowledge_item_tags_tagId_idx" ON "knowledge_item_tags"("tagId");

-- CreateIndex
CREATE INDEX "knowledge_items_contributorId_idx" ON "knowledge_items"("contributorId");

-- CreateIndex
CREATE INDEX "knowledge_items_categoryId_idx" ON "knowledge_items"("categoryId");

-- CreateIndex
CREATE INDEX "knowledge_items_status_idx" ON "knowledge_items"("status");

-- CreateIndex
CREATE INDEX "knowledge_attachments_knowledgeItemId_idx" ON "knowledge_attachments"("knowledgeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "forums_name_key" ON "forums"("name");

-- CreateIndex
CREATE UNIQUE INDEX "forums_slug_key" ON "forums"("slug");

-- CreateIndex
CREATE INDEX "forum_threads_forumId_idx" ON "forum_threads"("forumId");

-- CreateIndex
CREATE INDEX "forum_threads_authorId_idx" ON "forum_threads"("authorId");

-- CreateIndex
CREATE INDEX "forum_posts_threadId_idx" ON "forum_posts"("threadId");

-- CreateIndex
CREATE INDEX "forum_posts_authorId_idx" ON "forum_posts"("authorId");

-- CreateIndex
CREATE INDEX "forum_posts_parentPostId_idx" ON "forum_posts"("parentPostId");

-- AddForeignKey
ALTER TABLE "post_tags_on_posts" ADD CONSTRAINT "post_tags_on_posts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags_on_posts" ADD CONSTRAINT "post_tags_on_posts_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "post_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "post_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_item_tags" ADD CONSTRAINT "knowledge_item_tags_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_item_tags" ADD CONSTRAINT "knowledge_item_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "knowledge_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "knowledge_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_attachments" ADD CONSTRAINT "knowledge_attachments_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "forums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "forum_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_parentPostId_fkey" FOREIGN KEY ("parentPostId") REFERENCES "forum_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
