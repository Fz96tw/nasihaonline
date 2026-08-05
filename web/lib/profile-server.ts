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

/**
 * Fields /join used to require before its field-reduction (see
 * lib/validation/application.ts) and now expects the member to fill in on
 * their own Profile instead. Drives the hard first-sign-in onboarding gate
 * in the (member) layout — a member can't reach any other member page until
 * every one of these is set (§4.3).
 */
export function getMissingRequiredProfileFields(profile: ProfileWithSkills): string[] {
  const missing: string[] = [];
  if (!profile.countryRegion?.trim()) missing.push("Country / Region");
  if (!profile.titleSpecialty?.trim()) missing.push("Title / Specialty");
  if (!profile.careerStage) missing.push("Career Stage");
  if (profile.availability.length === 0) missing.push("Availability");
  if (profile.expertiseAreas.length === 0 && profile.skills.length === 0) {
    missing.push("Areas of Expertise");
  }
  if (!profile.learningTopics?.trim()) missing.push("Topics I Want to Learn");
  return missing;
}

export function isProfileComplete(profile: ProfileWithSkills): boolean {
  return getMissingRequiredProfileFields(profile).length === 0;
}
