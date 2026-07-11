-- AlterTable
ALTER TABLE "users" ADD COLUMN "clerkUserId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkUserId_key" ON "users"("clerkUserId");
