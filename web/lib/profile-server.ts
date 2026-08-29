import "server-only";
import { db } from "@/lib/db";
import { getProfileAvatarUrl } from "@/lib/storage";
import type { ProfileModel } from "@/lib/generated/prisma/models/Profile";
import type { SkillModel } from "@/lib/generated/prisma/models/Skill";
import type { CommunityModel } from "@/lib/generated/prisma/models/Community";
import { InterestArea } from "@/lib/generated/prisma/enums";
import { INTEREST_AREA_LABELS } from "@/lib/interest-areas";
import { getMissingRequiredProfileFields, isProfileComplete } from "@/lib/profile-completeness";

export { getMissingRequiredProfileFields, isProfileComplete };

const PROFILE_INCLUDE = {
  skills: { include: { skill: true } },
  communities: { include: { community: true } },
} as const;

export type ProfileWithSkills = ProfileModel & {
  skills: { skill: SkillModel }[];
  communities: { community: CommunityModel }[];
};
export type ProfileWithAvatarUrl = Omit<ProfileWithSkills, "avatarUrl"> & { avatarUrl: string | null };

/**
 * Every User gets a Profile row on creation (lib/clerk-sync.ts), so this is
 * normally a plain lookup — the create fallback only guards against a User
 * row that predates that guarantee.
 */
export async function getOrCreateProfile(userId: string): Promise<ProfileWithSkills> {
  const existing = await db.profile.findUnique({ where: { userId }, include: PROFILE_INCLUDE });
  if (existing) return existing;
  return db.profile.create({ data: { userId }, include: PROFILE_INCLUDE });
}

export function withResolvedAvatarUrl(profile: ProfileWithSkills): ProfileWithAvatarUrl {
  return { ...profile, avatarUrl: getProfileAvatarUrl(profile.avatarUrl) };
}

// Fixed 8-community display order (matches prisma/seed.ts's COMMUNITIES) —
// Community carries no displayOrder column, so callers sort against this
// instead of falling back to an alphabetical DB order.
export const COMMUNITY_DISPLAY_ORDER = [
  "Healthcare",
  "Sciences",
  "Business & Finance",
  "Technology",
  "Education & Career",
  "Humanities",
  "Arts, Culture & Lifestyle",
  "Nature & Outdoor",
] as const;

export async function getAllCommunities(): Promise<CommunityModel[]> {
  const communities = await db.community.findMany();
  return communities.sort(
    (a, b) => COMMUNITY_DISPLAY_ORDER.indexOf(a.name as (typeof COMMUNITY_DISPLAY_ORDER)[number]) -
      COMMUNITY_DISPLAY_ORDER.indexOf(b.name as (typeof COMMUNITY_DISPLAY_ORDER)[number]),
  );
}

/**
 * Resolves the "Search only my communities" toggle (community-based-
 * categorization initiative, objective 2) against a profile fetched
 * server-side — never trusts community ids passed from the client, since
 * only the viewer's own membership should ever narrow their own search.
 * Returns undefined (meaning "don't filter") when the toggle is off, the
 * member follows all communities, or has zero communities selected.
 */
export function getMemberCommunityIdsForFiltering(
  profile: Pick<ProfileWithSkills, "followsAllCommunities" | "communities">,
  myCommunitiesOnly: boolean,
): string[] | undefined {
  if (!myCommunitiesOnly || profile.followsAllCommunities) return undefined;
  const ids = profile.communities.map((c) => c.community.id);
  return ids.length > 0 ? ids : undefined;
}

/**
 * One-time onboarding suggestion only (community-based-categorization
 * initiative) — maps a member's existing interestAreas onto the community
 * their matching KnowledgeCategory belongs to (INTEREST_AREA_LABELS values
 * match KnowledgeCategory.name 1:1, per prisma/seed.ts). Independent of
 * Profile.communities afterward; not re-derived once the member has made an
 * explicit choice.
 */
export async function getSuggestedCommunityIds(interestAreas: InterestArea[]): Promise<string[]> {
  if (interestAreas.length === 0) return [];
  const labels = interestAreas.map((area) => INTEREST_AREA_LABELS[area]);
  const categories = await db.knowledgeCategory.findMany({
    where: { name: { in: labels } },
    select: { communityId: true },
  });
  return Array.from(new Set(categories.map((category) => category.communityId)));
}
