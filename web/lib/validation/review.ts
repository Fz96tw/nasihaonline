import { z } from "zod";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";

/**
 * Fields shared by "Submit an Item" (create) and editing a submission —
 * mirrors knowledgeItemBaseSchema (lib/validation/knowledge.ts) exactly,
 * since a ReviewItem reuses the same field shape as a Knowledge Library
 * resource. The uploaded file isn't part of this schema (travels as a
 * separate FormData entry, same rationale as the Library's schema).
 */
const reviewItemBaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
  contentType: z.nativeEnum(KnowledgeContentType, { message: "Select a content type" }),
  level: z.nativeEnum(KnowledgeLevel, { message: "Select a career-stage level" }),
  categoryIds: z.array(z.string()).min(1, "Select at least one category"),
  tagIds: z.array(z.string()),
  youtubeUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "Enter a valid URL (starting with http:// or https://)")
    .nullable(),
  externalUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "Enter a valid URL (starting with http:// or https://)")
    .nullable(),
  deidentificationConfirmed: z.boolean(),
});

/** case_study requires the de-identification checkbox; recorded_lecture requires a YouTube URL. */
function withContentTypeRefinements<Schema extends z.ZodType<z.infer<typeof reviewItemBaseSchema>>>(schema: Schema) {
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
  });
}

/**
 * The audience mode toggle (§ "Volunteer reviewers" in the design doc) —
 * "invite" requires at least one invitee (same invariant shape as
 * requireRestrictedKnowledgeItemInvariants), "volunteers" requires none and
 * sets seekingReviewers instead.
 */
function requireAudienceInvariants(
  data: { audienceMode: "invite" | "volunteers"; invitedUserIds: string[] },
  ctx: z.RefinementCtx,
) {
  if (data.audienceMode === "invite" && data.invitedUserIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["invitedUserIds"],
      message: "Select at least one reviewer to invite.",
    });
  }
}

/** POST /api/review-feedback body shape — shared with the client form (zodResolver). */
export const createReviewItemSchema = withContentTypeRefinements(
  reviewItemBaseSchema.extend({
    audienceMode: z.enum(["invite", "volunteers"]),
    invitedUserIds: z.array(z.string()),
    volunteerNote: z.string().trim().max(500).nullable(),
  }),
).superRefine(requireAudienceInvariants);
export type CreateReviewItemValues = z.infer<typeof createReviewItemSchema>;

/** PATCH /api/review-feedback/:id body shape (editing a submission). */
export const updateReviewItemSchema = withContentTypeRefinements(reviewItemBaseSchema);
export type UpdateReviewItemValues = z.infer<typeof updateReviewItemSchema>;

export const reviewCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(4000),
  parentId: z.string().nullable(),
});
export type ReviewCommentValues = z.infer<typeof reviewCommentSchema>;

export const reviewFlagSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(500),
});
export type ReviewFlagValues = z.infer<typeof reviewFlagSchema>;

export const reviewInviteesUpdateSchema = z.object({
  addUserIds: z.array(z.string()),
  removeUserIds: z.array(z.string()),
});
export type ReviewInviteesUpdateValues = z.infer<typeof reviewInviteesUpdateSchema>;

export const reviewVolunteerOfferSchema = z.object({
  note: z.string().trim().max(500).nullable(),
});
export type ReviewVolunteerOfferValues = z.infer<typeof reviewVolunteerOfferSchema>;
