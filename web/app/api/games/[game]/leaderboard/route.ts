import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isGameKey } from "@/lib/games";
import { getGameLeaderboard } from "@/lib/games-server";

export const dynamic = "force-dynamic";

/** GET /api/games/:game/leaderboard — public; `me` is filled in when signed in. */
export async function GET(_request: Request, { params }: { params: { game: string } }) {
  if (!isGameKey(params.game)) return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  const user = await getSessionUser();
  return NextResponse.json(await getGameLeaderboard(params.game, user?.id ?? null));
}
