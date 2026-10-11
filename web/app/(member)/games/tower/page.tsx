import type { Metadata } from "next";
import { TowerGame } from "@/components/games/tower/tower-game";

// Hidden prototype: not linked from the sidebar or sitemap yet.
export const metadata: Metadata = {
  title: "Lantern Tower",
  robots: { index: false, follow: false },
};

export default function TowerGamePage() {
  return <TowerGame />;
}
