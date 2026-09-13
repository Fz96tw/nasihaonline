-- AlterEnum
ALTER TYPE "KnowledgeStatus" ADD VALUE 'draft';

-- AlterTable
ALTER TABLE "knowledge_items" ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "level" DROP NOT NULL;
