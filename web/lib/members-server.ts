import "server-only";
import { db } from "@/lib/db";
import { getProfileAvatarUrl } from "@/lib/storage";
import { DIRECTORY_TIERS, type DirectoryMember } from "@/lib/members";

export type { DirectoryMember };

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
    include: { user: { select: { name: true, tier: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return profiles.map((profile) => ({
    id: profile.userId,
    name: profile.user.name,
    avatarUrl: getProfileAvatarUrl(profile.avatarUrl),
    tier: profile.user.tier,
    expertiseAreas: profile.expertiseAreas,
    titleSpecialty: profile.showSpecialtyLocation ? profile.titleSpecialty : null,
    countryRegion: profile.showSpecialtyLocation ? profile.countryRegion : null,
  }));
}
