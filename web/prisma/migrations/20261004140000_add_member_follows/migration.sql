-- CreateTable
CREATE TABLE "member_follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_follows_followedId_idx" ON "member_follows"("followedId");

-- CreateIndex
CREATE UNIQUE INDEX "member_follows_followerId_followedId_key" ON "member_follows"("followerId", "followedId");

-- AddForeignKey
ALTER TABLE "member_follows" ADD CONSTRAINT "member_follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_follows" ADD CONSTRAINT "member_follows_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
