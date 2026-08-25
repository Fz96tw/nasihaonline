-- CreateTable
CREATE TABLE "event_chat_messages" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "livekitMessageId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_chat_transcripts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "forumPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_chat_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_chat_messages_eventId_livekitMessageId_key" ON "event_chat_messages"("eventId", "livekitMessageId");

-- CreateIndex
CREATE INDEX "event_chat_messages_eventId_idx" ON "event_chat_messages"("eventId");

-- CreateIndex
CREATE INDEX "event_chat_transcripts_eventId_occurrenceDate_idx" ON "event_chat_transcripts"("eventId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "event_chat_messages" ADD CONSTRAINT "event_chat_messages_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_chat_transcripts" ADD CONSTRAINT "event_chat_transcripts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
