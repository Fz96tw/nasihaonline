import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { isGameKey } from "@/lib/games";
import { canSubmitGameScores, startGameRun } from "@/lib/games-server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/games/:game/runs — starts a scored run for a signed-in member.
 * The returned id is what the final score is submitted against; its
 * server-side start time is what bounds a plausible score.
 */
export async function POST(_request: Request, { params }: { params: { game: string } }) {
  if (!isGameKey(params.game)) return NextResponse.json({ error: "Unknown game" }, { status: 404 });

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
  if (!canSubmitGameScores(user)) {
    return NextResponse.json({ error: "Only members can post scores." }, { status: 403 });
  }

  const limit = await rateLimit(`games:start:${user.id}`, { limit: 30, windowSeconds: 60 });
  if (!limit.success) return NextResponse.json({ error: "Too many games started. Take a breath!" }, { status: 429 });

  const run = await startGameRun(params.game, user.id);
  return NextResponse.json({ id: run.id }, { status: 201 });
}
