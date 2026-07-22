import { z } from "zod";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";

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
  description: z.string().trim().min(1, "Description is required").max(2000),
  contentType: z.nativeEnum(KnowledgeContentType, { message: "Select a content type" }),
  level: z.nativeEnum(KnowledgeLevel, { message: "Select a career-stage level" }),
  categoryId: z.string().trim().min(1, "Select a category"),
  tagIds: z.array(z.string()),
  youtubeUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "Enter a valid URL (starting with http:// or https://)")
    .nullable(),
  deidentificationConfirmed: z.boolean(),
});

/** case_study requires the de-identification checkbox; recorded_lecture requires a YouTube URL. */
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
  });
}

/** POST /api/library body shape (§4.9) — shared with the client form (zodResolver). */
export const createKnowledgeItemSchema = withContentTypeRefinements(
  knowledgeItemBaseSchema.extend({
    licenseConsented: z
      .boolean()
      .refine((value) => value === true, "You must acknowledge the content licensing terms to submit."),
  }),
);
export type CreateKnowledgeItemValues = z.infer<typeof createKnowledgeItemSchema>;

/** PATCH /api/library/:id body shape (editing a submission) — same fields minus licenseConsented. */
export const updateKnowledgeItemSchema = withContentTypeRefinements(knowledgeItemBaseSchema);
export type UpdateKnowledgeItemValues = z.infer<typeof updateKnowledgeItemSchema>;
