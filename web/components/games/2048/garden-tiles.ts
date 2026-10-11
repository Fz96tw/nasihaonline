import { Bean, Cherry, Clover, Flower, Flower2, Leaf, Rose, Shrub, Sprout, TreePine, Trees, type LucideIcon } from "lucide-react";
import { gardenStage } from "@/lib/game-2048";

type TileStyle = { label: string; icon: LucideIcon; bg: string; fg: string; glow?: boolean };

// Soil → spring greens → flower pinks/reds → deep greens → gold forest.
const STYLES: Record<number, Omit<TileStyle, "label">> = {
  2: { icon: Bean, bg: "#f3ead9", fg: "#6b4f2a" },
  4: { icon: Sprout, bg: "#e3f1d4", fg: "#3f6212" },
  8: { icon: Leaf, bg: "#c6e5a8", fg: "#365314" },
  16: { icon: Clover, bg: "#9bd17a", fg: "#1a2e05" },
  32: { icon: Flower2, bg: "#f9c6d3", fg: "#9d174d" },
  64: { icon: Flower, bg: "#f48fb1", fg: "#ffffff" },
  128: { icon: Rose, bg: "#e11d48", fg: "#ffffff" },
  256: { icon: Shrub, bg: "#65a30d", fg: "#ffffff" },
  512: { icon: TreePine, bg: "#15803d", fg: "#ffffff" },
  1024: { icon: Cherry, bg: "#dc2626", fg: "#ffffff" },
  2048: { icon: Trees, bg: "#f5b82e", fg: "#3b2300", glow: true },
};
// Past 2048 the forest keeps growing: a darker, still-glowing forest tile.
const BEYOND: Omit<TileStyle, "label"> = { icon: Trees, bg: "#14532d", fg: "#fcd34d", glow: true };

export const GARDEN_CHAIN = Object.keys(STYLES).map(Number);

export function tileStyle(value: number): TileStyle {
  return { ...(STYLES[value] ?? BEYOND), label: gardenStage(value) };
}
