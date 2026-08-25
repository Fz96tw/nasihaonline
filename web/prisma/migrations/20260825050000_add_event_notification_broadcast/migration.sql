-- CreateTable
CREATE TABLE "event_notification_broadcasts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_notification_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_notification_broadcasts_eventId_sentAt_idx" ON "event_notification_broadcasts"("eventId", "sentAt");

-- AddForeignKey
ALTER TABLE "event_notification_broadcasts" ADD CONSTRAINT "event_notification_broadcasts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_notification_broadcasts" ADD CONSTRAINT "event_notification_broadcasts_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
