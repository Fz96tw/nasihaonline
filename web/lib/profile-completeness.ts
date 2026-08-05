/**
 * Pure, client-safe completeness check (no "server-only" — imported from
 * both the (member) layout's server-side gate and ProfileForm's client-side
 * post-save redirect, see lib/profile-server.ts and components/profile/
 * profile-form.tsx). Fields /join used to require before its field-reduction
 * (see lib/validation/application.ts) and now expects the member to fill in
 * on their own Profile instead.
 */
export type ProfileCompletenessFields = {
  countryRegion: string | null;
  titleSpecialty: string | null;
  careerStage: string | null;
  availability: unknown[];
  expertiseAreas: unknown[];
  skills: unknown[];
  learningTopics: string | null;
};

export function getMissingRequiredProfileFields(profile: ProfileCompletenessFields): string[] {
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

export function isProfileComplete(profile: ProfileCompletenessFields): boolean {
  return getMissingRequiredProfileFields(profile).length === 0;
}
