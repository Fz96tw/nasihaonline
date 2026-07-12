-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('earned', 'spent', 'adjusted');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "ContributionSource" AS ENUM ('event_attendance', 'meeting_request', 'self_reported');

-- CreateEnum
CREATE TYPE "MeetingRequestStatus" AS ENUM ('pending', 'accepted', 'declined', 'rescheduled');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('inbox_message', 'meeting_request_received', 'meeting_request_accepted', 'meeting_request_declined', 'meeting_request_rescheduled', 'contribution_awarded');

-- CreateTable
CREATE TABLE "contribution_rules" (
    "id" TEXT NOT NULL,
    "activityKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_events" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "counterpartId" TEXT,
    "note" TEXT,
    "source" "ContributionSource" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contribution_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contribution_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT,
    "type" "LedgerTransactionType" NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'pending',
    "hours" DECIMAL(5,2) NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_requests" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "proposedTimes" TIMESTAMP(3)[],
    "status" "MeetingRequestStatus" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "contributionLedgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contribution_rules_activityKey_key" ON "contribution_rules"("activityKey");

-- CreateIndex
CREATE INDEX "contribution_events_actorId_idx" ON "contribution_events"("actorId");

-- CreateIndex
CREATE INDEX "contribution_events_counterpartId_idx" ON "contribution_events"("counterpartId");

-- CreateIndex
CREATE INDEX "contribution_ledger_userId_status_idx" ON "contribution_ledger"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_requests_contributionLedgerId_key" ON "meeting_requests"("contributionLedgerId");

-- CreateIndex
CREATE INDEX "meeting_requests_recipientId_status_idx" ON "meeting_requests"("recipientId", "status");

-- CreateIndex
CREATE INDEX "meeting_requests_senderId_idx" ON "meeting_requests"("senderId");

-- CreateIndex
CREATE INDEX "inbox_messages_recipientId_readAt_idx" ON "inbox_messages"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "inbox_messages_senderId_idx" ON "inbox_messages"("senderId");

-- CreateIndex
CREATE INDEX "inbox_messages_parentId_idx" ON "inbox_messages"("parentId");

-- CreateIndex
CREATE INDEX "notifications_recipientId_readAt_idx" ON "notifications"("recipientId", "readAt");

-- AddForeignKey
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "contribution_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_counterpartId_fkey" FOREIGN KEY ("counterpartId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_ledger" ADD CONSTRAINT "contribution_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_ledger" ADD CONSTRAINT "contribution_ledger_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "contribution_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_ledger" ADD CONSTRAINT "contribution_ledger_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_ledger" ADD CONSTRAINT "contribution_ledger_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_contributionLedgerId_fkey" FOREIGN KEY ("contributionLedgerId") REFERENCES "contribution_ledger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "inbox_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
