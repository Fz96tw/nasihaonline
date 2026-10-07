import { z } from "zod";

// Limits keep a quote readable as a single forum post and bound what an admin
// can paste in. Shared by the admin form (client) and the API routes (server).
export const REFLECTION_QUOTE_TEXT_MAX = 500;
export const REFLECTION_AUTHOR_MAX = 120;
export const REFLECTION_SOURCE_MAX = 200;
export const REFLECTION_PROMPT_MAX = 300;

export const reflectionQuoteFieldsSchema = z.object({
  text: z.string().trim().min(1, "Quote is required").max(REFLECTION_QUOTE_TEXT_MAX, `Quote must be at most ${REFLECTION_QUOTE_TEXT_MAX} characters`),
  author: z.string().trim().min(1, "Author is required").max(REFLECTION_AUTHOR_MAX, `Author must be at most ${REFLECTION_AUTHOR_MAX} characters`),
  // Blank means "no source"; normalized to null so an empty string never reaches the DB.
  source: z
    .string()
    .trim()
    .max(REFLECTION_SOURCE_MAX, `Source must be at most ${REFLECTION_SOURCE_MAX} characters`)
    .nullish()
    .transform((value) => (value ? value : null)),
  prompt: z.string().trim().min(1, "Prompt is required").max(REFLECTION_PROMPT_MAX, `Prompt must be at most ${REFLECTION_PROMPT_MAX} characters`),
});
export type ReflectionQuoteFields = z.output<typeof reflectionQuoteFieldsSchema>;

export const createReflectionQuoteSchema = reflectionQuoteFieldsSchema;

export const updateReflectionQuoteSchema = reflectionQuoteFieldsSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Nothing to update");

export const reflectionSettingsSchema = z
  .object({
    weeklyReflectionEnabled: z.boolean().optional(),
    weeklyReflectionDayOfWeek: z.number().int().min(0).max(6).optional(),
    weeklyReflectionHour: z.number().int().min(0).max(23).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Nothing to update");

export const reflectionNextQuoteSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("swap"), quoteId: z.string().min(1) }),
  z.object({ action: z.literal("clear") }),
]);

export const reflectionPostNowSchema = z.object({ override: z.boolean().optional() });
