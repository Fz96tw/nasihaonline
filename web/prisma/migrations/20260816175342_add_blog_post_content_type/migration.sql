-- AlterEnum: fold Blog in as a Library content type.
ALTER TYPE "KnowledgeContentType" ADD VALUE 'blog_post';

-- AlterTable: full rich-text (Tiptap) body for blog_post items; nullable
-- since every pre-existing content type keeps using description/attachment/
-- externalUrl/youtubeUrl instead.
ALTER TABLE "knowledge_items" ADD COLUMN "body" TEXT;

-- CreateTable: redirect-only lookup for old /blog/[slug] URLs, populated by
-- the one-time Blog-to-Library data migration script.
CREATE TABLE "legacy_blog_slugs" (
    "slug" TEXT NOT NULL,
    "knowledgeItemId" TEXT NOT NULL,

    CONSTRAINT "legacy_blog_slugs_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "legacy_blog_slugs_knowledgeItemId_idx" ON "legacy_blog_slugs"("knowledgeItemId");

-- AddForeignKey
ALTER TABLE "legacy_blog_slugs" ADD CONSTRAINT "legacy_blog_slugs_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "knowledge_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
