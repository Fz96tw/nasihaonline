-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "followsAllCommunities" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "profile_communities" (
    "profileId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_communities_pkey" PRIMARY KEY ("profileId","communityId")
);

-- CreateIndex
CREATE INDEX "profile_communities_communityId_idx" ON "profile_communities"("communityId");

-- AddForeignKey
ALTER TABLE "profile_communities" ADD CONSTRAINT "profile_communities_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_communities" ADD CONSTRAINT "profile_communities_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
