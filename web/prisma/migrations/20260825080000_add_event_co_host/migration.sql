-- CreateTable
CREATE TABLE "event_co_hosts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_co_hosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_co_hosts_userId_idx" ON "event_co_hosts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "event_co_hosts_eventId_userId_key" ON "event_co_hosts"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "event_co_hosts" ADD CONSTRAINT "event_co_hosts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_co_hosts" ADD CONSTRAINT "event_co_hosts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
