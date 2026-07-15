import { z } from "zod";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";

/**
 * "Submit Resource" body shape (§4.9) — shared between the client form
 * (zodResolver) and POST /api/library's server-side parse, same pattern as
 * createEventSchema. The uploaded file isn't part of this schema (it
 * travels as a separate FormData entry, validated by uploadKnowledgeDocument)
 * — whether a file vs. youtubeUrl is required for a given contentType is
 * enforced in lib/library-server.ts's createKnowledgeItem, since "was a file
 * actually attached" isn't expressible here. deidentificationConfirmed must
 * be true for case_study; licenseConsented must always be true (§4.15).
 */
export const createKnowledgeItemSchema = z
  .object({
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
    licenseConsented: z
      .boolean()
      .refine((value) => value === true, "You must acknowledge the content licensing terms to submit."),
  })
  .superRefine((data, ctx) => {
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

export type CreateKnowledgeItemValues = z.infer<typeof createKnowledgeItemSchema>;
