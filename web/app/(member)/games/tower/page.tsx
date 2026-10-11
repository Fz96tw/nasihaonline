import type { Metadata } from "next";
import { TowerGame } from "@/components/games/tower/tower-game";
import { getSessionUser } from "@/lib/auth";
import { canSubmitGameScores, getGameLeaderboard } from "@/lib/games-server";

// Hidden prototype: not linked from the sidebar or sitemap yet.
export const metadata: Metadata = {
  title: "Lantern Tower",
  robots: { index: false, follow: false },
};

export default async function TowerGamePage() {
  const user = await getSessionUser();
  const leaderboard = await getGameLeaderboard("tower", user?.id ?? null);
  return <TowerGame initialLeaderboard={leaderboard} signedIn={!!user} canSubmit={canSubmitGameScores(user)} />;
}
