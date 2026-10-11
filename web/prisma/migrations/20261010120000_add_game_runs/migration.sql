-- CreateTable
CREATE TABLE "game_runs" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "score" INTEGER,
    "floors" INTEGER,
    "perfects" INTEGER,

    CONSTRAINT "game_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_runs_game_finishedAt_idx" ON "game_runs"("game", "finishedAt");

-- CreateIndex
CREATE INDEX "game_runs_game_score_idx" ON "game_runs"("game", "score");

-- CreateIndex
CREATE INDEX "game_runs_userId_idx" ON "game_runs"("userId");

-- AddForeignKey
ALTER TABLE "game_runs" ADD CONSTRAINT "game_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
