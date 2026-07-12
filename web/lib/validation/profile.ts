import { z } from "zod";

/**
 * Client-facing form shape: learningTopics is still edited as a single
 * comma-separated free-text field (matching the §4.3 prototype), not the
 * string[] shape it's persisted as — see splitList/joinList. expertiseAreas
 * is now split between tagged `skillIds` (selected from the Skill catalog)
 * and a comma-separated free-text fallback for anything not in that list
 * (§4.3/§7.3).
 */
export const profileFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  bio: z.string().trim().max(2000),
  countryRegion: z.string().trim().max(120),
  titleSpecialty: z.string().trim().max(120),
  careerStage: z.string().trim().max(120),
  skillIds: z.array(z.string()).max(30),
  expertiseAreas: z.string().trim().max(500),
  learningTopics: z.string().trim().max(500),
  listInDirectory: z.boolean(),
  showSpecialtyLocation: z.boolean(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

/** Comma-separated free text (as entered in the form) -> a trimmed list. */
export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

/** The inverse of splitList, for populating form default values. */
export function joinList(values: string[]): string {
  return values.join(", ");
}

/**
 * PATCH /api/profile body shape — expertiseAreas/learningTopics as arrays.
 * expertiseAreas here is the free-text fallback only; tagged expertise is
 * skillIds, validated against the real Skill catalog server-side.
 */
export const profilePatchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  bio: z.string().trim().max(2000),
  countryRegion: z.string().trim().max(120),
  titleSpecialty: z.string().trim().max(120),
  careerStage: z.string().trim().max(120),
  skillIds: z.array(z.string()).max(30),
  expertiseAreas: z.array(z.string().trim().min(1).max(80)).max(30),
  learningTopics: z.array(z.string().trim().min(1).max(80)).max(30),
  listInDirectory: z.boolean(),
  showSpecialtyLocation: z.boolean(),
});

export type ProfilePatchValues = z.infer<typeof profilePatchSchema>;
