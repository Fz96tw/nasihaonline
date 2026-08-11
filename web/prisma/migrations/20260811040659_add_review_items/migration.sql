-- CreateEnum
CREATE TYPE "ReviewItemStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "ReviewVolunteerStatus" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'peer_review_invited';
ALTER TYPE "NotificationType" ADD VALUE 'peer_review_comment';
ALTER TYPE "NotificationType" ADD VALUE 'peer_review_removed';
ALTER TYPE "NotificationType" ADD VALUE 'peer_review_volunteer_offered';
ALTER TYPE "NotificationType" ADD VALUE 'peer_review_volunteer_declined';

-- CreateTable
CREATE TABLE "review_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contentType" "KnowledgeContentType" NOT NULL,
    "level" "KnowledgeLevel" NOT NULL,
    "submitterId" TEXT NOT NULL,
    "youtubeUrl" TEXT,
    "externalUrl" TEXT,
    "heroImageUrl" TEXT,
    "deidentificationConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReviewItemStatus" NOT NULL DEFAULT 'open',
    "seekingReviewers" BOOLEAN NOT NULL DEFAULT false,
    "publishedKnowledgeItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_item_invitees" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_item_invitees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comments" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_item_views" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_item_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_item_attachments" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_item_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_item_categories" (
    "reviewItemId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "review_item_categories_pkey" PRIMARY KEY ("reviewItemId","categoryId")
);

-- CreateTable
CREATE TABLE "review_item_tags" (
    "reviewItemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "review_item_tags_pkey" PRIMARY KEY ("reviewItemId","tagId")
);

-- CreateTable
CREATE TABLE "review_volunteer_offers" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "status" "ReviewVolunteerStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "review_volunteer_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_items_publishedKnowledgeItemId_key" ON "review_items"("publishedKnowledgeItemId");

-- CreateIndex
CREATE INDEX "review_items_submitterId_idx" ON "review_items"("submitterId");

-- CreateIndex
CREATE INDEX "review_items_status_idx" ON "review_items"("status");

-- CreateIndex
CREATE INDEX "review_items_seekingReviewers_idx" ON "review_items"("seekingReviewers");

-- CreateIndex
CREATE INDEX "review_item_invitees_userId_idx" ON "review_item_invitees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "review_item_invitees_reviewItemId_userId_key" ON "review_item_invitees"("reviewItemId", "userId");

-- CreateIndex
CREATE INDEX "review_comments_reviewItemId_idx" ON "review_comments"("reviewItemId");

-- CreateIndex
CREATE INDEX "review_comments_authorId_idx" ON "review_comments"("authorId");

-- CreateIndex
CREATE INDEX "review_comments_parentId_idx" ON "review_comments"("parentId");

-- CreateIndex
CREATE INDEX "review_item_views_userId_idx" ON "review_item_views"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "review_item_views_reviewItemId_userId_key" ON "review_item_views"("reviewItemId", "userId");

-- CreateIndex
CREATE INDEX "review_item_attachments_reviewItemId_idx" ON "review_item_attachments"("reviewItemId");

-- CreateIndex
CREATE INDEX "review_item_categories_categoryId_idx" ON "review_item_categories"("categoryId");

-- CreateIndex
CREATE INDEX "review_item_tags_tagId_idx" ON "review_item_tags"("tagId");

-- CreateIndex
CREATE INDEX "review_volunteer_offers_reviewItemId_idx" ON "review_volunteer_offers"("reviewItemId");

-- CreateIndex
CREATE INDEX "review_volunteer_offers_userId_idx" ON "review_volunteer_offers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "review_volunteer_offers_reviewItemId_userId_key" ON "review_volunteer_offers"("reviewItemId", "userId");

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_publishedKnowledgeItemId_fkey" FOREIGN KEY ("publishedKnowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_invitees" ADD CONSTRAINT "review_item_invitees_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_invitees" ADD CONSTRAINT "review_item_invitees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "review_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_views" ADD CONSTRAINT "review_item_views_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_views" ADD CONSTRAINT "review_item_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_attachments" ADD CONSTRAINT "review_item_attachments_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_categories" ADD CONSTRAINT "review_item_categories_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_categories" ADD CONSTRAINT "review_item_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "knowledge_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_tags" ADD CONSTRAINT "review_item_tags_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_tags" ADD CONSTRAINT "review_item_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "knowledge_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_volunteer_offers" ADD CONSTRAINT "review_volunteer_offers_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "review_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_volunteer_offers" ADD CONSTRAINT "review_volunteer_offers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
