import "server-only";
import { db } from "@/lib/db";
import { getProfileAvatarUrl } from "@/lib/storage";
import { searchProfileDocuments } from "@/lib/meilisearch";
import { DIRECTORY_TIERS, type DirectoryMember } from "@/lib/members";
import type { ProfileModel } from "@/lib/generated/prisma/models/Profile";
import type { UserModel } from "@/lib/generated/prisma/models/User";

export type { DirectoryMember };

type ProfileWithUser = ProfileModel & {
  user: Pick<UserModel, "name" | "tier">;
  skills: { skill: { id: string; name: string } }[];
};

const PROFILE_INCLUDE = {
  user: { select: { name: true, tier: true } },
  skills: { select: { skill: { select: { id: true, name: true } } } },
} as const;

/**
 * Shared shape/visibility mapping (§4.3/§4.5/§9) used both by the plain
 * Postgres listing below and by the Meilisearch-backed search path — one
 * place enforces showSpecialtyLocation regardless of which path a caller
 * takes.
 */
function toDirectoryMember(profile: ProfileWithUser): DirectoryMember {
  return {
    id: profile.userId,
    name: profile.user.name,
    avatarUrl: getProfileAvatarUrl(profile.avatarUrl),
    tier: profile.user.tier,
    skills: profile.skills.map(({ skill }) => skill),
    expertiseAreas: profile.expertiseAreas,
    titleSpecialty: profile.showSpecialtyLocation ? profile.titleSpecialty : null,
    countryRegion: profile.showSpecialtyLocation ? profile.countryRegion : null,
  };
}

/**
 * The server-side enforcement point for directory visibility prefs (§4.3/§9):
 * a member with listInDirectory = false must not appear in this result set
 * at all, and one with showSpecialtyLocation = false must have those two
 * fields omitted even though the rest of their card is listed. Both rules
 * live here — in the query itself — so no caller can bypass them by reading
 * Profile directly.
 */
export async function getDirectoryMembers(): Promise<DirectoryMember[]> {
  const profiles = await db.profile.findMany({
    where: {
      listInDirectory: true,
      user: { tier: { in: DIRECTORY_TIERS } },
    },
    include: PROFILE_INCLUDE,
    orderBy: { user: { name: "asc" } },
  });

  return profiles.map(toDirectoryMember);
}

/**
 * Free-text directory search (§7.2/§9 — "near-instant"): Meilisearch only
 * holds the searchable fields, so hits are re-hydrated from Postgres for a
 * fresh signed avatar URL and to re-apply visibility in case the index is
 * ever briefly stale relative to a very recent preference toggle.
 */
export async function searchDirectoryMembers(query: string): Promise<DirectoryMember[]> {
  const hits = await searchProfileDocuments(query);
  if (hits.length === 0) return [];

  const profiles = await db.profile.findMany({
    where: {
      userId: { in: hits.map((hit) => hit.id) },
      listInDirectory: true,
      user: { tier: { in: DIRECTORY_TIERS } },
    },
    include: PROFILE_INCLUDE,
  });

  const byId = new Map(profiles.map((profile) => [profile.userId, profile]));
  // Preserve Meilisearch's relevance ordering rather than the DB fetch order.
  return hits
    .map((hit) => byId.get(hit.id))
    .filter((profile): profile is ProfileWithUser => Boolean(profile))
    .map(toDirectoryMember);
}
