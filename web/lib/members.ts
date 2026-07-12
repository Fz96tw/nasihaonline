// Client-safe Directory types/constants (PRD §4.5) — kept separate from
// members-server.ts so client components can import them without pulling
// in the "server-only" query logic.
import { Tier } from "@/lib/generated/prisma/enums";
import { TIER_LABELS } from "@/lib/validation/application-review";

// Friend tier is intentionally excluded from the Directory (§4.5) — its
// reduced access scope means it isn't listed/filterable there at all.
export const DIRECTORY_TIERS: Tier[] = [Tier.active, Tier.associate, Tier.student];

export type DirectoryMember = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  tier: Tier | null;
  // Tagged skills (§4.3/§7.3) — used both for card display and tag
  // filtering. expertiseAreas is the free-text fallback for anything not
  // in the Skill catalog.
  skills: { id: string; name: string }[];
  expertiseAreas: string[];
  titleSpecialty: string | null;
  countryRegion: string | null;
};

export const DIRECTORY_TIER_LABELS: Record<Tier, string> = TIER_LABELS;

export const TIER_BADGE_VARIANT: Record<Tier, "success" | "info" | "warning" | "neutral"> = {
  [Tier.active]: "success",
  [Tier.associate]: "info",
  [Tier.student]: "warning",
  [Tier.friend]: "neutral",
};
