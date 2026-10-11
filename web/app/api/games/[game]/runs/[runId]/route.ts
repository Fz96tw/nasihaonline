import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { isGameKey } from "@/lib/games";
import { GameError, finish2048Run, finishTowerRun, getGameLeaderboard } from "@/lib/games-server";
import { finish2048RunSchema, finishTowerRunSchema } from "@/lib/validation/games";

/**
 * PATCH /api/games/:game/runs/:runId — submits a run's result (once). Each
 * game has its own body shape and server-side check (lib/games-server.ts).
 * Responds with the refreshed leaderboard so the game-over screen can show
 * the member's new standing without a second request.
 */
export async function PATCH(request: Request, { params }: { params: { game: string; runId: string } }) {
  const game = params.game;
  if (!isGameKey(game)) return NextResponse.json({ error: "Unknown game" }, { status: 404 });

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const body = await request.json().catch(() => null);
  try {
    if (game === "tower") {
      const parsed = finishTowerRunSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      await finishTowerRun(params.runId, user.id, parsed.data);
    } else {
      const parsed = finish2048RunSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      await finish2048Run(params.runId, user.id, parsed.data.moves);
    }
  } catch (error) {
    if (error instanceof GameError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  return NextResponse.json({ leaderboard: await getGameLeaderboard(game, user.id) });
}
