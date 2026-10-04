-- AlterTable
ALTER TABLE "inbox_messages" ADD COLUMN     "reminderProcessedAt" TIMESTAMP(3);

-- Existing messages predate the reminder feature: mark them processed so the
-- first sweep after deploy never emails members about historical messages.
UPDATE "inbox_messages" SET "reminderProcessedAt" = NOW();

-- CreateIndex
CREATE INDEX "inbox_messages_reminderProcessedAt_createdAt_idx" ON "inbox_messages"("reminderProcessedAt", "createdAt");
