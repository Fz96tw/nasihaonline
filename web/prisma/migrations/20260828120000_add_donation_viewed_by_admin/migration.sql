-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "viewedByAdminAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "donations_viewedByAdminAt_idx" ON "donations"("viewedByAdminAt");
