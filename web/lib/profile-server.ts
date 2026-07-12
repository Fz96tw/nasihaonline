import "server-only";
import { db } from "@/lib/db";
import { getProfileAvatarUrl } from "@/lib/storage";
import type { ProfileModel } from "@/lib/generated/prisma/models/Profile";
import type { SkillModel } from "@/lib/generated/prisma/models/Skill";

const SKILLS_INCLUDE = { skills: { include: { skill: true } } } as const;

export type ProfileWithSkills = ProfileModel & { skills: { skill: SkillModel }[] };
export type ProfileWithAvatarUrl = Omit<ProfileWithSkills, "avatarUrl"> & { avatarUrl: string | null };

/**
 * Every User gets a Profile row on creation (lib/clerk-sync.ts), so this is
 * normally a plain lookup — the create fallback only guards against a User
 * row that predates that guarantee.
 */
export async function getOrCreateProfile(userId: string): Promise<ProfileWithSkills> {
  const existing = await db.profile.findUnique({ where: { userId }, include: SKILLS_INCLUDE });
  if (existing) return existing;
  return db.profile.create({ data: { userId }, include: SKILLS_INCLUDE });
}

export function withResolvedAvatarUrl(profile: ProfileWithSkills): ProfileWithAvatarUrl {
  return { ...profile, avatarUrl: getProfileAvatarUrl(profile.avatarUrl) };
}
