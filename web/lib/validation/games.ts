import { z } from "zod";

// Upper bounds are only sanity caps; the real plausibility check is
// towerResultProblem in lib/games.ts, which also needs the run's elapsed time.
export const finishTowerRunSchema = z.object({
  score: z.number().int().min(0).max(100_000),
  floors: z.number().int().min(0).max(10_000),
  perfects: z.number().int().min(0).max(10_000),
});
