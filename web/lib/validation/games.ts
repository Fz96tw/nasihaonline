import { z } from "zod";

// Upper bounds are only sanity caps; the real plausibility check is
// towerResultProblem in lib/games.ts, which also needs the run's elapsed time.
export const finishTowerRunSchema = z.object({
  score: z.number().int().min(0).max(100_000),
  floors: z.number().int().min(0).max(10_000),
  perfects: z.number().int().min(0).max(10_000),
});

// A long 2048 game is a few thousand moves; the cap only bounds request size.
export const finish2048RunSchema = z.object({
  moves: z.string().max(50_000).regex(/^[UDLR]*$/, "Moves must be U, D, L or R."),
});
