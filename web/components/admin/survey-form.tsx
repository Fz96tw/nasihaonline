"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  createSurveySchema,
  SURVEY_QUESTION_TYPES,
  SURVEY_QUESTION_TYPE_LABELS,
  type CreateSurveyValues,
} from "@/lib/validation/survey";
import { getCsrfToken } from "@/lib/csrf-client";

const CHOICE_TYPES = new Set(["single_choice", "multi_choice"]);

const BLANK_QUESTION: CreateSurveyValues["questions"][number] = {
  prompt: "",
  type: "short_text",
  required: true,
  options: [],
};

const DEFAULT_VALUES: CreateSurveyValues = {
  title: "",
  description: "",
  questions: [BLANK_QUESTION],
  audienceMembers: true,
  audienceDonors: false,
  audienceEventRegistrants: false,
  scheduledStartAt: null,
  durationDays: null,
  action: "draft",
};

/** Converts a stored ISO timestamp to the local "YYYY-MM-DDTHH:mm" value a <input type="datetime-local"> expects. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type SurveyFormInitialValues = {
  title: string;
  description: string;
  questions: CreateSurveyValues["questions"];
  audienceMembers: boolean;
  audienceDonors: boolean;
  audienceEventRegistrants: boolean;
  scheduledStartAt: string | null;
  durationDays: number | null;
  /** MinIO-proxied URL (already resolved via getSurveyHeroImageUrl), not the raw object key. */
  heroImageDisplayUrl?: string | null;
};

/**
 * Manages the options list for a single choice question by hand (setValue/
 * watch) rather than a nested useFieldArray — react-hook-form's ArrayPath
 * typing requires array elements to be objects (so each can carry a stable
 * `id`), which a plain `string[]` doesn't satisfy. Re-indexing on
 * add/remove is fine for a short options list.
 */
function QuestionOptionsEditor({
  form,
  questionIndex,
}: {
  form: UseFormReturn<CreateSurveyValues>;
  questionIndex: number;
}) {
  const options = form.watch(`questions.${questionIndex}.options`) ?? [];
  const optionsError = form.formState.errors.questions?.[questionIndex]?.options;

  function setOptions(next: string[]) {
    form.setValue(`questions.${questionIndex}.options`, next, { shouldValidate: true, shouldDirty: true });
  }

  return (
    <div className="flex flex-col gap-2 pl-4">
      <span className="text-xs font-medium text-muted-foreground">Options</span>
      {options.map((option, optionIndex) => (
        <div key={optionIndex} className="flex items-center gap-2">
          <Input
            placeholder={`Option ${optionIndex + 1}`}
            value={option}
            onChange={(e) => {
              const next = [...options];
              next[optionIndex] = e.target.value;
              setOptions(next);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOptions(options.filter((_, i) => i !== optionIndex))}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, ""])}>
          Add option
        </Button>
      </div>
      {optionsError?.message && <p className="text-sm text-destructive">{optionsError.message}</p>}
    </div>
  );
}

/**
 * "Compose Survey" form — question builder (useFieldArray) + audience
 * checkboxes + schedule fields + an optional cover image, posted as
 * multipart (the image travels alongside a single "payload" JSON field —
 * `questions` is a nested array too awkward to flatten into individual
 * FormData keys), same shape as AnnouncementForm. `mode: "create"` always
 * POSTs a brand-new draft (blank, or pre-filled from `initialValues` for a
 * "use as template" resend — the source survey's history entry stays
 * untouched, same never-mutate convention as Announcements; `templateSourceId`
 * is that source survey's id, sent as `fromId` so the server can resolve its
 * cover image without trusting a client-supplied storage key). `mode: "edit"`
 * PATCHes an existing draft in place, the one case a Survey row is ever
 * mutated. Either mode can submit as "Save Draft" or "Schedule / Send Now" —
 * `action` is set per-button at submit time, not a form field the user
 * edits directly.
 */
export function SurveyForm({
  mode,
  surveyId,
  templateSourceId,
  initialValues,
}: {
  mode: "create" | "edit";
  surveyId?: string;
  templateSourceId?: string;
  initialValues?: SurveyFormInitialValues;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImage, setHeroImage] = useState<File | null>(null);

  const form = useForm<CreateSurveyValues>({
    resolver: zodResolver(createSurveySchema),
    defaultValues: initialValues
      ? {
          ...DEFAULT_VALUES,
          title: initialValues.title,
          description: initialValues.description,
          questions: initialValues.questions.length > 0 ? initialValues.questions : [BLANK_QUESTION],
          audienceMembers: initialValues.audienceMembers,
          audienceDonors: initialValues.audienceDonors,
          audienceEventRegistrants: initialValues.audienceEventRegistrants,
          scheduledStartAt: toDatetimeLocalValue(initialValues.scheduledStartAt) || null,
          durationDays: initialValues.durationDays,
        }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: "questions" });

  const audienceValues = form.watch(["audienceMembers", "audienceDonors", "audienceEventRegistrants"]);
  const checkedAudienceCount = audienceValues.filter(Boolean).length;

  const scheduledStartAt = form.watch("scheduledStartAt");

  async function onSubmit(values: CreateSurveyValues, action: "draft" | "send") {
    if (action === "send") {
      const confirmMessage = values.scheduledStartAt
        ? `Schedule this survey to open on ${new Date(values.scheduledStartAt).toLocaleString()}?`
        : "Send this survey now? Invitations go out immediately and can't be unsent.";
      if (!window.confirm(confirmMessage)) return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("payload", JSON.stringify({ ...values, action }));
      if (heroImage) formData.append("heroImage", heroImage);
      if (mode === "create" && templateSourceId) formData.append("fromId", templateSourceId);

      const res = await fetch(mode === "create" ? "/api/admin/surveys" : `/api/admin/surveys/${surveyId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "x-csrf-token": csrfToken },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : body?.error
              ? JSON.stringify(body.error)
              : "Something went wrong. Please try again.",
        );
      }
      router.push("/admin/surveys");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form className="flex flex-col gap-6" noValidate>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. 2026 Membership Feedback" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="What is this survey for?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="survey-hero-image" className="text-sm font-medium">
            Cover image (optional)
          </label>
          {initialValues?.heroImageDisplayUrl && !heroImage && (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
            <img
              src={initialValues.heroImageDisplayUrl}
              alt="Current cover image"
              className="h-32 w-full max-w-xs rounded-md object-cover"
            />
          )}
          <input
            id="survey-hero-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setHeroImage(e.target.files?.[0] ?? null)}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
          />
          {initialValues?.heroImageDisplayUrl && (
            <p className="text-xs text-muted-foreground">Choose a new file to replace it.</p>
          )}
          <p className="text-xs text-muted-foreground">Shown on the invite email, the feed, and the response page.</p>
        </div>

        <div className="flex flex-col gap-4">
          <span className="text-sm font-medium">Questions</span>
          {fields.map((field, index) => {
            const questionType = form.watch(`questions.${index}.type`);
            return (
              <div key={field.id} className="flex flex-col gap-3 rounded-[10px] border p-4">
                <div className="flex items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`questions.${index}.prompt`}
                    render={({ field: promptField }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Question {index + 1}</FormLabel>
                        <FormControl>
                          <Input placeholder="Question text" {...promptField} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex flex-wrap items-end gap-4">
                  <FormField
                    control={form.control}
                    name={`questions.${index}.type`}
                    render={({ field: typeField }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select value={typeField.value} onValueChange={typeField.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SURVEY_QUESTION_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {SURVEY_QUESTION_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`questions.${index}.required`}
                    render={({ field: requiredField }) => (
                      <FormItem>
                        <label className="flex items-center gap-2 text-sm">
                          <FormControl>
                            <Checkbox checked={requiredField.value} onCheckedChange={requiredField.onChange} />
                          </FormControl>
                          <span>Required</span>
                        </label>
                      </FormItem>
                    )}
                  />

                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={index === fields.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      Move down
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                {CHOICE_TYPES.has(questionType) && <QuestionOptionsEditor form={form} questionIndex={index} />}
              </div>
            );
          })}
          <div>
            <Button type="button" variant="outline" onClick={() => append(BLANK_QUESTION)}>
              Add question
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Audience</span>
          <FormField
            control={form.control}
            name="audienceMembers"
            render={({ field }) => (
              <FormItem>
                <label className="flex items-center gap-2 text-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={field.value && checkedAudienceCount <= 1}
                    />
                  </FormControl>
                  <span>Members</span>
                </label>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="audienceDonors"
            render={({ field }) => (
              <FormItem>
                <label className="flex items-center gap-2 text-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={field.value && checkedAudienceCount <= 1}
                    />
                  </FormControl>
                  <span>Donors (opted in to email updates)</span>
                </label>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="audienceEventRegistrants"
            render={({ field }) => (
              <FormItem>
                <label className="flex items-center gap-2 text-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={field.value && checkedAudienceCount <= 1}
                    />
                  </FormControl>
                  <span>Non-member event registrants (all-time)</span>
                </label>
              </FormItem>
            )}
          />
          {form.formState.errors.audienceMembers && (
            <p className="text-sm text-destructive">{form.formState.errors.audienceMembers.message}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-6">
          <FormField
            control={form.control}
            name="scheduledStartAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">Blank sends immediately.</p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="durationDays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Auto-close after (days, optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                    className="w-32"
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">Blank stays open until manually closed.</p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={form.handleSubmit((values) => onSubmit(values, "draft"))}
          >
            {submitting ? "Saving…" : "Save Draft"}
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={form.handleSubmit((values) => onSubmit(values, "send"))}
          >
            {submitting ? "Sending…" : scheduledStartAt ? "Schedule Survey" : "Send Now"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
