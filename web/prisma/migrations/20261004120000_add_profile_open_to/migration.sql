-- CreateEnum
CREATE TYPE "OpenToTag" AS ENUM ('mentoring', 'being_mentored', 'study_partner', 'collaboration', 'just_chatting');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "openTo" "OpenToTag"[] DEFAULT ARRAY[]::"OpenToTag"[];
