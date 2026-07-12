// No "server-only" guard: imported directly by scripts/worker.ts and
// scripts/reindex-profiles.ts, which run outside Next's server runtime.
import { db } from "@/lib/db";
import { deleteProfileDocument, upsertProfileDocument } from "@/lib/meilisearch";
import { DIRECTORY_TIERS } from "@/lib/members";

/**
 * Re-derives directory eligibility from the DB rather than trusting the
 * caller, so this stays correct regardless of which write path triggered it
 * (profile edit, avatar change, preference toggle, §4.3/§7.2). Ineligible
 * profiles (not listed, or a tier the Directory excludes — Friend, §4.5) are
 * removed from the index rather than left stale.
 */
export async function syncProfileToIndex(userId: string): Promise<void> {
  const profile = await db.profile.findUnique({
    where: { userId },
    include: { user: { select: { name: true, tier: true } } },
  });

  const eligible =
    profile?.listInDirectory && profile.user.tier !== null && DIRECTORY_TIERS.includes(profile.user.tier);

  if (!eligible) {
    await deleteProfileDocument(userId);
    return;
  }

  await upsertProfileDocument({
    id: profile.userId,
    name: profile.user.name,
    tier: profile.user.tier,
    expertiseAreas: profile.expertiseAreas,
    titleSpecialty: profile.showSpecialtyLocation ? profile.titleSpecialty : null,
    countryRegion: profile.showSpecialtyLocation ? profile.countryRegion : null,
  });
}
