import { z } from "zod";

/**
 * Question types offered by the compose UI's question builder. Distinct
 * from any "form builder" abstraction elsewhere in the app — this is a
 * closed, survey-specific set.
 */
export const SURVEY_QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "rating",
  "yes_no",
] as const;

export const SURVEY_QUESTION_TYPE_LABELS: Record<(typeof SURVEY_QUESTION_TYPES)[number], string> = {
  short_text: "Short answer",
  long_text: "Long answer",
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  rating: "Rating (1–5)",
  yes_no: "Yes / No",
};

const CHOICE_TYPES = new Set<(typeof SURVEY_QUESTION_TYPES)[number]>(["single_choice", "multi_choice"]);

export const surveyQuestionSchema = z
  .object({
    prompt: z.string().trim().min(1, "Question text is required").max(500),
    type: z.enum(SURVEY_QUESTION_TYPES),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(200)).max(20),
  })
  .refine((question) => !CHOICE_TYPES.has(question.type) || question.options.length >= 2, {
    message: "Choice questions need at least 2 options",
    path: ["options"],
  });

/**
 * "Compose Survey" body shape — shared between the admin form (zodResolver)
 * and the server-side parse in POST /api/admin/surveys. `action` picks
 * "draft" (persist, no invitations) vs "send" (schedule/send immediately,
 * depending on scheduledStartAt), same request shape either way.
 * `scheduledStartAt`/`durationDays` are plain nullable fields, not
 * preprocessed ("" -> null etc.) here — the form component normalizes those
 * before they ever reach react-hook-form state, so the schema's input and
 * output types stay identical. (A z.preprocess here previously desynced
 * zodResolver's inferred input/output generics enough that TS treated the
 * resulting Resolver type as unrelated to itself.) Posts as JSON, not
 * multipart, since surveys have no file upload, unlike
 * createAnnouncementSchema's multipart form.
 */
export const createSurveySchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000),
    questions: z.array(surveyQuestionSchema).min(1, "Add at least one question"),
    audienceMembers: z.boolean(),
    audienceDonors: z.boolean(),
    audienceEventRegistrants: z.boolean(),
    scheduledStartAt: z.string().trim().min(1).nullable(),
    durationDays: z.number().int().min(1).max(365).nullable(),
    action: z.enum(["draft", "send"]),
  })
  .refine((values) => values.audienceMembers || values.audienceDonors || values.audienceEventRegistrants, {
    message: "Select at least one audience",
    path: ["audienceMembers"],
  });

export type CreateSurveyValues = z.infer<typeof createSurveySchema>;
export type SurveyQuestionValues = z.infer<typeof surveyQuestionSchema>;

/**
 * Answer submission shape for POST /api/surveys/respond/[token]. Keyed by
 * questionId rather than array order since the client fetches the question
 * set separately from the response page's own render.
 */
export const submitSurveyResponseSchema = z.object({
  answers: z.record(z.string(), z.array(z.string().trim().min(1).max(1000)).max(20)),
});

export type SubmitSurveyResponseValues = z.infer<typeof submitSurveyResponseSchema>;
