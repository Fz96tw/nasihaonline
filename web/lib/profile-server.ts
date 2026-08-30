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
 * Community-based-categorization initiative, objective 3's "default filter
 * state": a browse page with no explicit community selection scopes to the
 * union of the member's own communities instead of showing everything or
 * nothing — unless they follow all communities, or explicitly picked one,
 * in which case that wins outright. Signed-out visitors (profile null, e.g.
 * the public /events page) always get unfiltered. Implemented once here so
 * every consuming page (Library now, Events/Forum in their own objectives)
 * shares the exact same rule rather than each re-deriving it.
 */
export function getDefaultCommunityFilter(
  profile: Pick<ProfileWithSkills, "followsAllCommunities" | "communities"> | null,
  explicitCommunityId?: string | null,
): string[] | undefined {
  if (explicitCommunityId) return [explicitCommunityId];
  if (!profile || profile.followsAllCommunities) return undefined;
  const ids = profile.communities.map((c) => c.community.id);
  return ids.length > 0 ? ids : undefined;
}

export type MemberCommunityContext = { communityIds: string[]; followsAllCommunities: boolean };

/**
 * Auto-join rule (community-based-categorization initiative): a member who
 * gets tagged into a community's content — submitting/hosting an item under
 * it, or being invited to one — becomes a real member of that community,
 * not just someone who can see the one item. This is what lets the "Show
 * only my communities" checkbox (Peer Review's dashboard included) safely
 * include a personal item tagged under a community the member hadn't
 * explicitly joined — they're a real member the moment they're tagged.
 * Called by every domain's create/invite path (Library, Review,
 * Events, Forum) with the submitter/host + any invitees and the content's
 * community id(s). A follows-all-communities member is skipped — they're
 * already effectively a member of everything. `skipDuplicates` makes this
 * safe to call unconditionally on every create/invite, not just the first.
 */
export async function ensureCommunityMembership(userIds: string[], communityIds: string[]): Promise<void> {
  const uniqueUserIds = Array.from(new Set(userIds));
  const uniqueCommunityIds = Array.from(new Set(communityIds));
  if (uniqueUserIds.length === 0 || uniqueCommunityIds.length === 0) return;

  const profiles = await db.profile.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: { id: true, followsAllCommunities: true },
  });

  const rows = profiles
    .filter((profile) => !profile.followsAllCommunities)
    .flatMap((profile) => uniqueCommunityIds.map((communityId) => ({ profileId: profile.id, communityId })));
  if (rows.length === 0) return;

  await db.profileCommunity.createMany({ data: rows, skipDuplicates: true });
}

/**
 * Lean per-viewer lookup for access-control gating helpers (Events'
 * isEventVisibleToMember, Forum's isForumAccessibleToMember) — deliberately
 * not ProfileWithSkills above, which eagerly joins Skill and full Community
 * rows this only needs ids from. `null` for a signed-out visitor (no
 * userId) or the rare pre-onboarding profile-less user. Lives here (not in
 * events-server.ts, where it originated) so forums-server.ts can import it
 * too without a circular dependency — events-server.ts already imports
 * createForumPost from forums-server.ts.
 */
export async function getMemberCommunityContext(userId: string | null): Promise<MemberCommunityContext | null> {
  if (!userId) return null;
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { followsAllCommunities: true, communities: { select: { communityId: true } } },
  });
  if (!profile) return null;
  return {
    communityIds: profile.communities.map((c) => c.communityId),
    followsAllCommunities: profile.followsAllCommunities,
  };
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
