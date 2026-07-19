-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "retractedAt" TIMESTAMP(3),
ADD COLUMN     "retractedById" TEXT;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_retractedById_fkey" FOREIGN KEY ("retractedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
