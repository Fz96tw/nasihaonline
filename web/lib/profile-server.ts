import "server-only";
import { db } from "@/lib/db";
import { getProfileAvatarUrl } from "@/lib/storage";
import type { ProfileModel } from "@/lib/generated/prisma/models/Profile";

export type ProfileWithAvatarUrl = Omit<ProfileModel, "avatarUrl"> & { avatarUrl: string | null };

/**
 * Every User gets a Profile row on creation (lib/clerk-sync.ts), so this is
 * normally a plain lookup — the create fallback only guards against a User
 * row that predates that guarantee.
 */
export async function getOrCreateProfile(userId: string): Promise<ProfileModel> {
  const existing = await db.profile.findUnique({ where: { userId } });
  if (existing) return existing;
  return db.profile.create({ data: { userId } });
}

export function withResolvedAvatarUrl(profile: ProfileModel): ProfileWithAvatarUrl {
  return { ...profile, avatarUrl: getProfileAvatarUrl(profile.avatarUrl) };
}
