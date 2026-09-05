import { z } from "zod";
import { KnowledgeContentType, KnowledgeLevel, KnowledgeVisibility } from "@/lib/generated/prisma/enums";

/**
 * Fields shared by "Submit Resource" (create) and editing a submission
 * (§4.9) — split out so update can `.omit()` licenseConsented (a one-time
 * consent from the original submission, not re-collected on edit, same
 * rationale as updatePostSchema) while both still share the
 * contentType-conditional refinements below. The uploaded file isn't part
 * of this schema (it travels as a separate FormData entry) — whether a
 * file vs. youtubeUrl is required for a given contentType is enforced in
 * lib/library-server.ts, since "was a file actually attached / does an
 * attachment already exist" isn't expressible here.
 */
const knowledgeItemBaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  // Required for every content type except blog_post, where it's
  // auto-derived server-side from `body` (excerptFromHtml) rather than
  // typed by the contributor — see withContentTypeRefinements below.
  description: z.string().trim().max(2000),
  // Full rich-text (Tiptap) article content — required only for
  // contentType = blog_post, which has no attachment/externalUrl/youtubeUrl.
  body: z.string().trim().nullable(),
  contentType: z.nativeEnum(KnowledgeContentType, { message: "Select a content type" }),
  level: z.nativeEnum(KnowledgeLevel, { message: "Select a career-stage level" }),
  // Required, multi-select top-level classification (standardized onto
  // Events' EventCommunity shape) — categoryIds below is now optional,
  // scoped in the UI to whichever communities are selected here.
  communityIds: z.array(z.string()).min(1, "Select at least one community"),
  categoryIds: z.array(z.string()),
  tagIds: z.array(z.string()),
  youtubeUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "Enter a valid URL (starting with http:// or https://)")
    .nullable(),
  // Alternative to a file upload for article/case_study/guideline items — a
  // link to a resource hosted elsewhere (e.g. a Google Doc). Mutually
  // exclusive with a file, enforced in lib/library-server.ts alongside the
  // youtubeUrl/file requirement, for the same "depends on the multipart
  // FormData" reason noted above.
  externalUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "Enter a valid URL (starting with http:// or https://)")
    .nullable(),
  deidentificationConfirmed: z.boolean(),
});

/**
 * case_study requires the de-identification checkbox; recorded_lecture
 * requires a YouTube URL; blog_post requires body instead of description
 * (auto-derived server-side) — every other type requires description, typed
 * by the contributor as today.
 */
function withContentTypeRefinements<Schema extends z.ZodType<z.infer<typeof knowledgeItemBaseSchema>>>(
  schema: Schema,
) {
  return schema.superRefine((data, ctx) => {
    if (data.contentType === KnowledgeContentType.case_study && !data.deidentificationConfirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deidentificationConfirmed"],
        message: "You must confirm all patient information has been de-identified.",
      });
    }
    if (data.contentType === KnowledgeContentType.recorded_lecture && !data.youtubeUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["youtubeUrl"],
        message: "A YouTube URL is required for a recorded lecture.",
      });
    }
    if (data.contentType === KnowledgeContentType.blog_post) {
      if (!data.body || data.body.replace(/<[^>]+>/g, "").trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "Write your post before submitting." });
      }
    } else if (data.description.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["description"], message: "Description is required" });
    }
  });
}

// Restricted Knowledge Library Submissions, Objective 03 — mirrors
// requireRestrictedEventInvariants in lib/validation/event.ts. Create-only
// (see KnowledgeVisibility's schema comment): updateKnowledgeItemSchema
// below never gains these fields.
function requireRestrictedKnowledgeItemInvariants(
  data: { visibility: KnowledgeVisibility; invitedUserIds: string[] },
  ctx: z.RefinementCtx,
) {
  if (data.visibility !== KnowledgeVisibility.restricted) return;
  if (data.invitedUserIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["invitedUserIds"],
      message: "Select at least one member to invite.",
    });
  }
}

/** POST /api/library body shape (§4.9) — shared with the client form (zodResolver). */
export const createKnowledgeItemSchema = withContentTypeRefinements(
  knowledgeItemBaseSchema.extend({
    licenseConsented: z
      .boolean()
      .refine((value) => value === true, "You must acknowledge the content licensing terms to submit."),
    visibility: z.nativeEnum(KnowledgeVisibility),
    invitedUserIds: z.array(z.string()),
  }),
).superRefine(requireRestrictedKnowledgeItemInvariants);
export type CreateKnowledgeItemValues = z.infer<typeof createKnowledgeItemSchema>;

/** PATCH /api/library/:id body shape (editing a submission) — same fields minus licenseConsented. */
export const updateKnowledgeItemSchema = withContentTypeRefinements(knowledgeItemBaseSchema);
export type UpdateKnowledgeItemValues = z.infer<typeof updateKnowledgeItemSchema>;
