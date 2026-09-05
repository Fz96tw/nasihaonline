/*
  Warnings:

  - You are about to drop the column `communityId` on the `forums` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "forums" DROP CONSTRAINT "forums_communityId_fkey";

-- AlterTable
ALTER TABLE "forums" DROP COLUMN "communityId",
ADD COLUMN     "categoryId" TEXT;

-- AddForeignKey
ALTER TABLE "forums" ADD CONSTRAINT "forums_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "knowledge_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
