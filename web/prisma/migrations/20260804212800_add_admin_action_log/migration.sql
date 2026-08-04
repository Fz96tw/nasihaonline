-- CreateTable
CREATE TABLE "admin_action_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_action_log_createdAt_idx" ON "admin_action_log"("createdAt");

-- CreateIndex
CREATE INDEX "admin_action_log_entityType_entityId_idx" ON "admin_action_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "admin_action_log_actorId_idx" ON "admin_action_log"("actorId");

-- AddForeignKey
ALTER TABLE "admin_action_log" ADD CONSTRAINT "admin_action_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
