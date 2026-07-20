// Client-safe Directory types/constants (PRD §4.5) — kept separate from
// members-server.ts so client components can import them without pulling
// in the "server-only" query logic.
import { ApplicationAvailability, InterestArea, Tier } from "@/lib/generated/prisma/enums";
import { TIER_LABELS } from "@/lib/validation/application-review";

// Every tier is listed/filterable in the Directory (§4.5), Friend included
// (with its own tier badge) — but Friend-tier members can't be messaged or
// sent a meeting request from their card, and can't use the Inbox
// themselves, since the Inbox is exclusively Directory-originated (§4.7).
export const DIRECTORY_TIERS: Tier[] = [Tier.active, Tier.associate, Tier.student, Tier.friend];

// The subset of tiers that can send/receive Inbox messages and meeting
// requests (§4.7) — Friend tier is excluded.
export const INBOX_TIERS: Tier[] = [Tier.active, Tier.associate, Tier.student];

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
  careerStage: string | null;
  learningTopics: string | null;
  bio: string | null;
  interestAreas: InterestArea[];
  availability: ApplicationAvailability[];
};

export const DIRECTORY_TIER_LABELS: Record<Tier, string> = TIER_LABELS;

export const TIER_BADGE_VARIANT: Record<Tier, "success" | "info" | "warning" | "neutral"> = {
  [Tier.active]: "success",
  [Tier.associate]: "info",
  [Tier.student]: "warning",
  [Tier.friend]: "neutral",
};
