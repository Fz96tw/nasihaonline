import "server-only";
import { db } from "@/lib/db";
import { getProfileAvatarUrl } from "@/lib/storage";
import { isoWeekStart } from "@/lib/reflection-schedule";
import { Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { gardenStage, replay2048, seedFromString } from "@/lib/game-2048";
import {
  game2048PaceProblem,
  towerResultProblem,
  type GameKey,
  type GameLeaderboard,
  type TowerResult,
} from "@/lib/games";

const WEEKLY_BOARD_SIZE = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class GameError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

/** Anyone may play; only admitted members get onto the boards. */
export function canSubmitGameScores(user: Pick<UserModel, "role" | "suspended"> | null): boolean {
  if (!user || user.suspended) return false;
  return user.role === Role.member || user.role === Role.moderator || user.role === Role.admin;
}

export async function startGameRun(game: GameKey, userId: string): Promise<{ id: string }> {
  return db.gameRun.create({ data: { game, userId }, select: { id: true } });
}

/**
 * The caller's own unfinished run of `game`, plus how long ago it started.
 * Elapsed time always comes from the row's startedAt (set by the database
 * when the run began), never from the client — that's what makes the
 * per-game plausibility checks meaningful.
 */
async function openRun(runId: string, userId: string, game: GameKey) {
  const run = await db.gameRun.findUnique({ where: { id: runId } });
  if (!run || run.userId !== userId || run.game !== game) throw new GameError("Game not found.", 404);
  if (run.finishedAt) throw new GameError("This game was already submitted.", 409);
  return { run, elapsedMs: Date.now() - run.startedAt.getTime() };
}

/** Completes a run exactly once; finishedAt: null in the filter makes a double-submit race a no-op. */
async function completeRun(runId: string, data: { score: number; floors?: number; perfects?: number; maxTile?: number }) {
  const { count } = await db.gameRun.updateMany({
    where: { id: runId, finishedAt: null },
    data: { ...data, finishedAt: new Date() },
  });
  if (count === 0) throw new GameError("This game was already submitted.", 409);
}

export async function finishTowerRun(runId: string, userId: string, result: TowerResult): Promise<void> {
  const { elapsedMs } = await openRun(runId, userId, "tower");
  const problem = towerResultProblem(result, elapsedMs);
  if (problem) throw new GameError(problem, 422);
  await completeRun(runId, result);
}

/**
 * Garden 2048: the client sends only its moves. The board is replayed from
 * the seed the run's id implies (the same seed the client was given), and
 * the score that counts is the one the replay produces.
 */
export async function finish2048Run(runId: string, userId: string, moves: string): Promise<void> {
  const { run, elapsedMs } = await openRun(runId, userId, "2048");
  const problem = game2048PaceProblem(moves.length, elapsedMs);
  if (problem) throw new GameError(problem, 422);
  const result = replay2048(seedFromString(run.id), moves);
  if (!result.valid) throw new GameError("Those moves don't match this game.", 422);
  await completeRun(runId, { score: result.score, maxTile: result.maxTile });
}

function recordDetail(game: GameKey, run: { floors: number | null; maxTile: number | null }): string | null {
  if (game === "tower") return run.floors === null ? null : `${run.floors} ${run.floors === 1 ? "floor" : "floors"}`;
  return run.maxTile === null ? null : `grew a ${gardenStage(run.maxTile)}`;
}

export async function getGameLeaderboard(game: GameKey, viewerId: string | null): Promise<GameLeaderboard> {
  const weekStart = isoWeekStart(new Date());
  const counted = { game, score: { not: null }, finishedAt: { not: null }, user: { suspended: false } };
  const thisWeek = { ...counted, finishedAt: { gte: weekStart } };

  const [weeklyBest, recordRun] = await Promise.all([
    db.gameRun.groupBy({
      by: ["userId"],
      where: thisWeek,
      _max: { score: true },
      orderBy: { _max: { score: "desc" } },
      take: WEEKLY_BOARD_SIZE,
    }),
    db.gameRun.findFirst({
      where: counted,
      orderBy: [{ score: "desc" }, { finishedAt: "asc" }],
      select: { userId: true, score: true, floors: true, maxTile: true, user: { select: { name: true } } },
    }),
  ]);

  const users = await db.user.findMany({
    where: { id: { in: weeklyBest.map((row) => row.userId) } },
    select: { id: true, name: true, profile: { select: { avatarUrl: true } } },
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  let me: GameLeaderboard["me"] = null;
  if (viewerId) {
    const [week, allTime] = await Promise.all([
      db.gameRun.aggregate({ where: { ...thisWeek, userId: viewerId }, _max: { score: true } }),
      db.gameRun.aggregate({ where: { ...counted, userId: viewerId }, _max: { score: true } }),
    ]);
    const weeklyBestScore = week._max.score;
    let weeklyRank: number | null = null;
    if (weeklyBestScore !== null) {
      const ahead = await db.gameRun.groupBy({
        by: ["userId"],
        where: thisWeek,
        having: { score: { _max: { gt: weeklyBestScore } } },
      });
      weeklyRank = ahead.length + 1;
    }
    me = { userId: viewerId, weeklyBest: weeklyBestScore, weeklyRank, allTimeBest: allTime._max.score };
  }

  return {
    weekly: weeklyBest.map((row) => {
      const user = byId.get(row.userId);
      return {
        // Shared scores share a rank (1, 2, 2, 4), matching how weeklyRank counts.
        rank: weeklyBest.findIndex((other) => other._max.score === row._max.score) + 1,
        userId: row.userId,
        name: user?.name?.trim() || "Member",
        avatarUrl: getProfileAvatarUrl(user?.profile?.avatarUrl ?? null),
        score: row._max.score ?? 0,
      };
    }),
    record: recordRun
      ? {
          userId: recordRun.userId,
          name: recordRun.user.name?.trim() || "Member",
          score: recordRun.score ?? 0,
          detail: recordDetail(game, recordRun),
        }
      : null,
    me,
    weekEndsAt: new Date(weekStart.getTime() + WEEK_MS).toISOString(),
  };
}
