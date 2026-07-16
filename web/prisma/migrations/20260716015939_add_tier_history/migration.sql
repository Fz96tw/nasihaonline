-- CreateTable
CREATE TABLE "tier_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromTier" "Tier",
    "toTier" "Tier",
    "changedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tier_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tier_history_userId_idx" ON "tier_history"("userId");

-- AddForeignKey
ALTER TABLE "tier_history" ADD CONSTRAINT "tier_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_history" ADD CONSTRAINT "tier_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
