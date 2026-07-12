import { z } from "zod";

/**
 * Client-facing form shape: expertiseAreas/learningTopics are edited as a
 * single comma-separated free-text field (matching the §4.3 prototype),
 * not the string[] shape they're persisted as — see splitList/joinList.
 */
export const profileFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  bio: z.string().trim().max(2000),
  countryRegion: z.string().trim().max(120),
  titleSpecialty: z.string().trim().max(120),
  careerStage: z.string().trim().max(120),
  expertiseAreas: z.string().trim().max(500),
  learningTopics: z.string().trim().max(500),
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

/** PATCH /api/profile body shape — expertiseAreas/learningTopics as arrays. */
export const profilePatchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  bio: z.string().trim().max(2000),
  countryRegion: z.string().trim().max(120),
  titleSpecialty: z.string().trim().max(120),
  careerStage: z.string().trim().max(120),
  expertiseAreas: z.array(z.string().trim().min(1).max(80)).max(30),
  learningTopics: z.array(z.string().trim().min(1).max(80)).max(30),
});

export type ProfilePatchValues = z.infer<typeof profilePatchSchema>;
