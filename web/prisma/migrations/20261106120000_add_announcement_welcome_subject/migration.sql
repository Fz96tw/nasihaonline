-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "welcomeSubjectId" TEXT;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_welcomeSubjectId_fkey" FOREIGN KEY ("welcomeSubjectId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
