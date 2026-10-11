import type { Metadata } from "next";
import { Garden2048 } from "@/components/games/2048/garden-2048";
import { getSessionUser } from "@/lib/auth";
import { canSubmitGameScores, getGameLeaderboard } from "@/lib/games-server";

// Hidden like /games/tower: not linked from the sidebar or sitemap.
export const metadata: Metadata = {
  title: "Garden 2048",
  robots: { index: false, follow: false },
};

export default async function Garden2048Page() {
  const user = await getSessionUser();
  const leaderboard = await getGameLeaderboard("2048", user?.id ?? null);
  return <Garden2048 initialLeaderboard={leaderboard} signedIn={!!user} canSubmit={canSubmitGameScores(user)} />;
}
