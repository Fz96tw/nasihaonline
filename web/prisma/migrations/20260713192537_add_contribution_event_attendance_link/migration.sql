-- AlterTable
ALTER TABLE "contribution_events" ADD COLUMN     "attendanceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contribution_events_attendanceId_key" ON "contribution_events"("attendanceId");

-- AddForeignKey
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

