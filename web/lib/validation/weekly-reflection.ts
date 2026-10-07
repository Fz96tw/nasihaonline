import { z } from "zod";

// Limits keep a quote readable as a single forum post and bound what an admin
// can paste in. Shared by the admin form (client) and the API routes (server).
// Defined in lib/reflection-limits.ts (pure constants) and re-exported here so
// existing importers keep working.
import {
  REFLECTION_AUTHOR_MAX,
  REFLECTION_BODY_TEMPLATE_MAX,
  REFLECTION_PROMPT_MAX,
  REFLECTION_QUOTE_TEXT_MAX,
  REFLECTION_SOURCE_MAX,
  REFLECTION_TITLE_TEMPLATE_MAX,
} from "../reflection-limits.ts";
import {
  BODY_PLACEHOLDERS,
  TITLE_PLACEHOLDERS,
  findUnknownPlaceholders,
  fitsForumPost,
  fitsForumTitle,
} from "../reflection-template.ts";

export {
  REFLECTION_AUTHOR_MAX,
  REFLECTION_BODY_TEMPLATE_MAX,
  REFLECTION_PROMPT_MAX,
  REFLECTION_QUOTE_TEXT_MAX,
  REFLECTION_SOURCE_MAX,
  REFLECTION_TITLE_TEMPLATE_MAX,
};

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

export const reflectionMessageSchema = z.object({
  titleTemplate: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(REFLECTION_TITLE_TEMPLATE_MAX, `Title must be at most ${REFLECTION_TITLE_TEMPLATE_MAX} characters`)
    .superRefine((value, ctx) => {
      const unknown = findUnknownPlaceholders(value, TITLE_PLACEHOLDERS);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `The title can only use ${TITLE_PLACEHOLDERS.map((name) => `{${name}}`).join(" and ")}. Not recognized: ${unknown.join(", ")}`,
        });
      } else if (!fitsForumTitle(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That title could be too long for a forum thread title. Shorten it or use {quote} fewer times." });
      }
    }),
  // Not trimmed: leading/trailing blank lines are the admin's choice.
  bodyTemplate: z
    .string()
    .min(1, "Message is required")
    .max(REFLECTION_BODY_TEMPLATE_MAX, `Message must be at most ${REFLECTION_BODY_TEMPLATE_MAX} characters`)
    .superRefine((value, ctx) => {
      if (!value.includes("{quote}")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The message must include {quote}, or the post would have no quote in it." });
      }
      const unknown = findUnknownPlaceholders(value, BODY_PLACEHOLDERS);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Not recognized: ${unknown.join(", ")}. Use ${BODY_PLACEHOLDERS.map((name) => `{${name}}`).join(", ")}.`,
        });
      }
      if (unknown.length === 0 && !fitsForumPost(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "That message could exceed the forum's post length limit with a long quote. Shorten it or use fewer placeholders." });
      }
    }),
});
export type ReflectionMessage = z.output<typeof reflectionMessageSchema>;
