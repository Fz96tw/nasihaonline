import { z } from "zod";
import { InterestArea, ApplicationAvailability } from "@/lib/generated/prisma/enums";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Optional public profile link (e.g. LinkedIn) — empty string means unset. */
const linkedinUrlSchema = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === "" || isHttpUrl(value), {
    message: "Enter a valid URL (starting with http:// or https://)",
  });

/**
 * Client-facing form shape: expertiseAreas is split between tagged
 * `skillIds` (selected from the Skill catalog) and a comma-separated
 * free-text fallback for anything not in that list (§4.3/§7.3).
 * learningTopics is free text, same shape as bio.
 */
export const profileFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  bio: z.string().trim().max(2000),
  countryRegion: z.string().trim().max(120),
  titleSpecialty: z.string().trim().max(120),
  careerStage: z.string().trim().max(120),
  linkedinUrl: linkedinUrlSchema,
  skillIds: z.array(z.string()).max(30),
  expertiseAreas: z.string().trim().max(500),
  learningTopics: z.string().trim().max(2000),
  interestAreas: z.array(z.nativeEnum(InterestArea)),
  availability: z.array(z.nativeEnum(ApplicationAvailability)),
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
 * PATCH /api/profile body shape — expertiseAreas is an array (free-text
 * fallback only; tagged expertise is skillIds, validated against the real
 * Skill catalog server-side). learningTopics is free text, same shape as bio.
 */
export const profilePatchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  bio: z.string().trim().max(2000),
  countryRegion: z.string().trim().max(120),
  titleSpecialty: z.string().trim().max(120),
  careerStage: z.string().trim().max(120),
  linkedinUrl: linkedinUrlSchema,
  skillIds: z.array(z.string()).max(30),
  expertiseAreas: z.array(z.string().trim().min(1).max(80)).max(30),
  learningTopics: z.string().trim().max(2000),
  interestAreas: z.array(z.nativeEnum(InterestArea)),
  availability: z.array(z.nativeEnum(ApplicationAvailability)),
  listInDirectory: z.boolean(),
  showSpecialtyLocation: z.boolean(),
});

export type ProfilePatchValues = z.infer<typeof profilePatchSchema>;
