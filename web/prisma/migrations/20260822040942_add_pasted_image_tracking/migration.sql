-- CreateEnum
CREATE TYPE "PastedImageOwnerType" AS ENUM ('forum_post', 'inbox_message', 'library_item');

-- CreateTable
CREATE TABLE "pasted_images" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "ownerType" "PastedImageOwnerType" NOT NULL,
    "forumPostId" TEXT,
    "inboxMessageId" TEXT,
    "knowledgeItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pasted_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pasted_images_key_key" ON "pasted_images"("key");

-- CreateIndex
CREATE INDEX "pasted_images_forumPostId_idx" ON "pasted_images"("forumPostId");

-- CreateIndex
CREATE INDEX "pasted_images_inboxMessageId_idx" ON "pasted_images"("inboxMessageId");

-- CreateIndex
CREATE INDEX "pasted_images_knowledgeItemId_idx" ON "pasted_images"("knowledgeItemId");

-- AddForeignKey
ALTER TABLE "pasted_images" ADD CONSTRAINT "pasted_images_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasted_images" ADD CONSTRAINT "pasted_images_forumPostId_fkey" FOREIGN KEY ("forumPostId") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasted_images" ADD CONSTRAINT "pasted_images_inboxMessageId_fkey" FOREIGN KEY ("inboxMessageId") REFERENCES "inbox_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pasted_images" ADD CONSTRAINT "pasted_images_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

