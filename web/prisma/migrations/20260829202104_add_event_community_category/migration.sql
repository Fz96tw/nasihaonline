-- CreateTable
CREATE TABLE "event_communities" (
    "eventId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,

    CONSTRAINT "event_communities_pkey" PRIMARY KEY ("eventId","communityId")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "eventId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("eventId","categoryId")
);

-- CreateIndex
CREATE INDEX "event_communities_communityId_idx" ON "event_communities"("communityId");

-- CreateIndex
CREATE INDEX "event_categories_categoryId_idx" ON "event_categories"("categoryId");

-- AddForeignKey
ALTER TABLE "event_communities" ADD CONSTRAINT "event_communities_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_communities" ADD CONSTRAINT "event_communities_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "knowledge_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
