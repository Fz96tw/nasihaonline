import "server-only";
import { db } from "@/lib/db";
import { getProfileAvatarUrl } from "@/lib/storage";
import { isoWeekStart } from "@/lib/reflection-schedule";
import { Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import {
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
 * Completes a run exactly once. The elapsed time comes from the row's own
 * startedAt (set by the database when the run was started), never from the
 * client, which is what makes the plausibility check meaningful.
 */
export async function finishTowerRun(runId: string, userId: string, result: TowerResult): Promise<void> {
  const run = await db.gameRun.findUnique({ where: { id: runId } });
  if (!run || run.userId !== userId || run.game !== "tower") throw new GameError("Game not found.", 404);
  if (run.finishedAt) throw new GameError("This game was already submitted.", 409);

  const elapsedMs = Date.now() - run.startedAt.getTime();
  const problem = towerResultProblem(result, elapsedMs);
  if (problem) throw new GameError(problem, 422);

  // finishedAt: null in the filter makes a double submit race a no-op.
  const { count } = await db.gameRun.updateMany({
    where: { id: runId, finishedAt: null },
    data: { finishedAt: new Date(), score: result.score, floors: result.floors, perfects: result.perfects },
  });
  if (count === 0) throw new GameError("This game was already submitted.", 409);
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
      select: { userId: true, score: true, floors: true, user: { select: { name: true } } },
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
          floors: recordRun.floors ?? 0,
        }
      : null,
    me,
    weekEndsAt: new Date(weekStart.getTime() + WEEK_MS).toISOString(),
  };
}
