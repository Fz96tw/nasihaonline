-- CreateEnum
CREATE TYPE "ContactService" AS ENUM ('research_curation', 'peer_review_feedback', 'teaching_sharing');

-- AlterTable
ALTER TABLE "contact_messages" ADD COLUMN     "services" "ContactService"[] DEFAULT ARRAY[]::"ContactService"[];
