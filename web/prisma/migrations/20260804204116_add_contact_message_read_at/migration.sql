-- AlterTable
ALTER TABLE "contact_messages" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "contact_messages_readAt_idx" ON "contact_messages"("readAt");
