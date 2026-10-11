import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { isGameKey } from "@/lib/games";
import { GameError, finishTowerRun, getGameLeaderboard } from "@/lib/games-server";
import { finishTowerRunSchema } from "@/lib/validation/games";

/**
 * PATCH /api/games/:game/runs/:runId — submits a run's final score (once).
 * Responds with the refreshed leaderboard so the game-over screen can show
 * the member's new standing without a second request.
 */
export async function PATCH(request: Request, { params }: { params: { game: string; runId: string } }) {
  if (params.game !== "tower") {
    return NextResponse.json({ error: isGameKey(params.game) ? "Unsupported game" : "Unknown game" }, { status: 404 });
  }

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = finishTowerRunSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await finishTowerRun(params.runId, user.id, parsed.data);
  } catch (error) {
    if (error instanceof GameError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  return NextResponse.json({ leaderboard: await getGameLeaderboard("tower", user.id) });
}
