-- Blog posts can belong to more than one category (§4.8), same change as
-- the earlier knowledge_item_categories migration. Adds the
-- post_categories_on_posts join table, backfills it from each post's
-- existing single categoryId, then drops that column/FK/index.

-- CreateTable
CREATE TABLE "post_categories_on_posts" (
    "postId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "post_categories_on_posts_pkey" PRIMARY KEY ("postId","categoryId")
);

-- CreateIndex
CREATE INDEX "post_categories_on_posts_categoryId_idx" ON "post_categories_on_posts"("categoryId");

-- AddForeignKey
ALTER TABLE "post_categories_on_posts" ADD CONSTRAINT "post_categories_on_posts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_categories_on_posts" ADD CONSTRAINT "post_categories_on_posts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "post_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: each post's current category becomes its first entry.
INSERT INTO "post_categories_on_posts" ("postId", "categoryId")
SELECT "id", "categoryId" FROM "posts" WHERE "categoryId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_categoryId_fkey";

-- DropIndex
DROP INDEX "posts_categoryId_idx";

-- AlterTable
ALTER TABLE "posts" DROP COLUMN "categoryId";
