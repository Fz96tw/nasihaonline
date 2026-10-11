// Shared, client-safe definitions for the /games/* mini games — no db and no
// "@/" alias, so the score-plausibility check runs under plain `node --test`.

export const GAMES = {
  tower: { title: "Lantern Tower" },
} as const;

export type GameKey = keyof typeof GAMES;

export function isGameKey(value: string): value is GameKey {
  return Object.prototype.hasOwnProperty.call(GAMES, value);
}

export type TowerResult = { score: number; floors: number; perfects: number };

/**
 * Fastest a floor can possibly be placed: the crane lowers the next block
 * (~255ms in tower-engine.ts) and it then has to fall onto the tower
 * (~300ms+). 450ms leaves slack for clock jitter between the start request
 * and the client actually starting.
 */
export const TOWER_MIN_MS_PER_FLOOR = 450;
/** A run left open longer than this can no longer be submitted. */
export const GAME_RUN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Why a submitted Lantern Tower result can't be real, or null if it's
 * plausible. Scoring (tower-engine.ts): every floor is +1, and a perfect drop
 * adds the current combo count on top, so the best case for `perfects`
 * perfect drops is one unbroken combo: floors + perfects·(perfects+1)/2.
 */
export function towerResultProblem(result: TowerResult, elapsedMs: number): string | null {
  const { score, floors, perfects } = result;
  if (perfects > floors) return "More perfect drops than floors.";
  if (score < floors) return "Score is lower than the floors placed.";
  if (score > floors + (perfects * (perfects + 1)) / 2) return "Score is higher than those drops allow.";
  if (elapsedMs < floors * TOWER_MIN_MS_PER_FLOOR) return "Too many floors for the time played.";
  if (elapsedMs > GAME_RUN_MAX_AGE_MS) return "This game has expired.";
  return null;
}

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  score: number;
};

export type GameLeaderboard = {
  /** Best score per member this UTC ISO week, highest first. */
  weekly: LeaderboardEntry[];
  /** All-time single best run. */
  record: { userId: string; name: string; score: number; floors: number } | null;
  /** The viewer's own standing; null when not signed in. */
  me: { userId: string; weeklyBest: number | null; weeklyRank: number | null; allTimeBest: number | null } | null;
  /** When the weekly board resets (next Monday 00:00 UTC), ISO string. */
  weekEndsAt: string;
};
