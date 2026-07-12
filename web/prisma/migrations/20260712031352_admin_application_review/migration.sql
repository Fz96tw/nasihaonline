-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('active', 'associate', 'student', 'friend');

-- AlterTable
ALTER TABLE "membership_applications" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "adminNoteVisibleToApplicant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assignedTier" "Tier",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByEmail" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tier" "Tier";

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
