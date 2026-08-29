"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryCheckboxField } from "@/components/shared/category-checkbox-field";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS, type ReviewCategoryOption, type ReviewItemForEdit, type ReviewTagOption } from "@/lib/review";
import { createReviewItemSchema, editReviewItemFormSchema, type CreateReviewItemValues } from "@/lib/validation/review";
import { getCsrfToken } from "@/lib/csrf-client";
import { InviteePicker } from "@/components/members/invitee-picker";

// Mirrors ALLOWED_DOCUMENT_MIME_TYPES in lib/storage.ts (uploadKnowledgeDocument,
// shared by Library and Peer Review) — a browser accept hint only, the
// server re-validates regardless.
const DOCUMENT_ACCEPT =
  "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,image/jpeg,image/png,image/webp,image/gif,image/bmp";

const DEFAULT_VALUES: CreateReviewItemValues = {
  title: "",
  description: "",
  contentType: "" as KnowledgeContentType,
  level: "" as KnowledgeLevel,
  categoryIds: [],
  tagIds: [],
  youtubeUrl: null,
  externalUrl: null,
  deidentificationConfirmed: false,
  audienceMode: "invite",
  invitedUserIds: [],
  volunteerNote: null,
};

/**
 * "Submit an Item" form, posted from /review-feedback/new, and reused from
 * /review-feedback/[id]/edit when `existingItem` is supplied. Forked from
 * SubmitResourceForm (components/library/submit-resource-form.tsx) — same
 * field shape, minus licenseConsented (nothing here is published openly by
 * default) and with the public/restricted visibility split replaced by the
 * Select-Reviewers/Request-Volunteers audience-mode toggle (same
 * conditional-gate shape as the Forums new-thread form's Everyone/Invite-only
 * toggle). Editing can replace the file/link source the same way the
 * Library form's edit mode does (updateReviewItem swaps the attachment and
 * cleans up the old MinIO object) — only the hero image stays create-only,
 * shown read-only when editing.
 */
export function SubmitReviewItemForm({
  categories,
  communities,
  tags,
  existingItem,
  currentUserId,
}: {
  categories: ReviewCategoryOption[];
  communities: { id: string; name: string }[];
  tags: ReviewTagOption[];
  existingItem?: ReviewItemForEdit;
  /** Current user's id — excludes them from the invitee picker's suggestions (create mode only). */
  currentUserId?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<"file" | "link">(existingItem?.externalUrl ? "link" : "file");
  const [heroImage, setHeroImage] = useState<File | null>(null);

  const form = useForm<CreateReviewItemValues>({
    resolver: zodResolver(existingItem ? editReviewItemFormSchema : createReviewItemSchema),
    defaultValues: existingItem
      ? {
          title: existingItem.title,
          description: existingItem.description,
          contentType: existingItem.contentType,
          level: existingItem.level,
          categoryIds: existingItem.categoryIds,
          tagIds: existingItem.tagIds,
          youtubeUrl: existingItem.youtubeUrl,
          externalUrl: existingItem.externalUrl,
          deidentificationConfirmed: existingItem.deidentificationConfirmed,
          // Audience isn't editable from this form — reviewers are managed
          // separately via ManageReviewInvitees on the detail page.
          audienceMode: "invite",
          invitedUserIds: [],
          volunteerNote: existingItem.volunteerNote,
        }
      : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const contentType = form.watch("contentType");
  const isRecordedLecture = contentType === KnowledgeContentType.recorded_lecture;
  const isCaseStudy = contentType === KnowledgeContentType.case_study;
  const audienceMode = form.watch("audienceMode");
  const isInviteMode = audienceMode === "invite";
  // Volunteer note only ever makes sense for an open call: at creation
  // that's the "Request Volunteers" toggle; once submitted, seekingReviewers
  // is fixed (this form doesn't expose changing it), so edit mode keys off
  // the existing item's own value instead.
  const showVolunteerNote = existingItem ? existingItem.seekingReviewers : !isInviteMode;

  async function onSubmit(values: CreateReviewItemValues) {
    setSubmitting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("title", values.title);
      formData.append("description", values.description);
      formData.append("contentType", values.contentType);
      formData.append("level", values.level);
      values.categoryIds.forEach((categoryId) => formData.append("categoryIds", categoryId));
      values.tagIds.forEach((tagId) => formData.append("tagIds", tagId));
      if (isRecordedLecture && values.youtubeUrl) formData.append("youtubeUrl", values.youtubeUrl);
      if (!isRecordedLecture && sourceMode === "link" && values.externalUrl) {
        formData.append("externalUrl", values.externalUrl);
      }
      formData.append("deidentificationConfirmed", String(isCaseStudy && values.deidentificationConfirmed));
      if (!existingItem) {
        formData.append("audienceMode", values.audienceMode);
        formData.append("invitedUserIds", JSON.stringify(values.invitedUserIds));
      }
      if (showVolunteerNote && values.volunteerNote) formData.append("volunteerNote", values.volunteerNote);
      if (!isRecordedLecture && sourceMode === "file" && file) formData.append("file", file);
      if (heroImage) formData.append("heroImage", heroImage);

      const res = await fetch(existingItem ? `/api/review-feedback/${existingItem.id}` : "/api/review-feedback", {
        method: existingItem ? "PATCH" : "POST",
        headers: { "x-csrf-token": csrfToken },
        body: formData,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : payload?.error
              ? JSON.stringify(payload.error)
              : "Something went wrong. Please try again.",
        );
      }
      if (existingItem) {
        // Replace (not push) so this edit page's history entry doesn't
        // linger for BackLink's router.back() on the details page to land
        // on — same rationale as WritePostForm/EditThreadForm.
        router.replace(`/review-feedback/${existingItem.id}?saved=1`);
      } else {
        router.push("/review-feedback");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        {!existingItem && (
          <FormField
            control={form.control}
            name="audienceMode"
            render={({ field }) => (
              <FormItem className="rounded-md border p-4">
                <FormLabel>Reviewers</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="invite">Select Reviewers</SelectItem>
                    <SelectItem value="volunteers">Request Volunteers</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {isInviteMode
                    ? "Pick specific members you'd like feedback from."
                    : "Open a call to the whole community — anyone can offer to review, and you choose who to accept."}
                </FormDescription>
              </FormItem>
            )}
          />
        )}

        {!existingItem && isInviteMode && (
          <FormField
            control={form.control}
            name="invitedUserIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reviewers</FormLabel>
                <FormControl>
                  <InviteePicker value={field.value} onChange={field.onChange} excludeUserId={currentUserId} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {showVolunteerNote && (
          <FormField
            control={form.control}
            name="volunteerNote"
            render={({ field }) => (
              <FormItem>
                <FormLabel>What kind of feedback are you looking for? (optional)</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Managing Diabetic Ketoacidosis in the ED" {...field} />
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
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={4} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="contentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Content type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {/* blog_post is Library-only (it has no attachment/externalUrl to
                        review, and its own review gate already runs through the
                        Steward queue) — excluded from Peer Review & Feedback's type list. */}
                    {Object.values(KnowledgeContentType)
                      .filter((value) => value !== KnowledgeContentType.blog_post)
                      .map((value) => (
                        <SelectItem key={value} value={value}>
                          {CONTENT_TYPE_LABELS[value]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="level"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Career-stage level</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a level" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.values(KnowledgeLevel).map((value) => (
                      <SelectItem key={value} value={value}>
                        {LEVEL_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="categoryIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categories</FormLabel>
              <CategoryCheckboxField
                categories={categories}
                communities={communities}
                value={field.value}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {tags.length > 0 && (
          <FormField
            control={form.control}
            name="tagIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tags (optional)</FormLabel>
                <div className="flex flex-wrap gap-4">
                  {tags.map((tag) => {
                    const checked = field.value.includes(tag.id);
                    return (
                      <label key={tag.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            field.onChange(c === true ? [...field.value, tag.id] : field.value.filter((id) => id !== tag.id))
                          }
                        />
                        {tag.name}
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {isRecordedLecture ? (
          <FormField
            control={form.control}
            name="youtubeUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>YouTube URL</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://youtube.com/watch?v=…"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="review-source-mode" className="text-sm font-medium">
                How do you want to provide your document?
              </label>
              <Select
                value={sourceMode}
                onValueChange={(value) => {
                  const mode = value as "file" | "link";
                  setSourceMode(mode);
                  if (mode === "file") {
                    form.setValue("externalUrl", null);
                  } else {
                    setFile(null);
                  }
                }}
              >
                <SelectTrigger id="review-source-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="file">Upload a file</SelectItem>
                  <SelectItem value="link">Web link to external source</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sourceMode === "file" ? (
              <div className="flex flex-col gap-2">
                <label htmlFor="review-item-file" className="text-sm font-medium">
                  File
                </label>
                {existingItem?.attachment && !file && (
                  <a
                    href={existingItem.attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {existingItem.attachment.fileName}
                  </a>
                )}
                <input
                  id="review-item-file"
                  type="file"
                  accept={DOCUMENT_ACCEPT}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  PDF, Word, PowerPoint, plain text, or image (JPEG/PNG/WebP/GIF/BMP) — up to 20MB.
                </p>
                {existingItem?.attachment && (
                  <p className="text-xs text-muted-foreground">Choose a new file to replace the current one.</p>
                )}
              </div>
            ) : (
              <FormField
                control={form.control}
                name="externalUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>External URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://docs.google.com/document/d/…"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value.length > 0 ? e.target.value : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="review-hero-image" className="text-sm font-medium">
            Hero image (optional)
          </label>
          {existingItem?.heroImageUrl && !heroImage && (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Library's same rationale
            <img src={existingItem.heroImageUrl} alt="Current hero image" className="h-32 w-full max-w-xs rounded-md object-cover" />
          )}
          <input
            id="review-hero-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setHeroImage(e.target.files?.[0] ?? null)}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
          />
          {existingItem?.heroImageUrl && (
            <p className="text-xs text-muted-foreground">Choose a new file to replace the current image.</p>
          )}
          {isRecordedLecture && (
            <p className="text-xs text-muted-foreground">Leave blank to use the video&apos;s YouTube thumbnail (default).</p>
          )}
        </div>

        {isCaseStudy && (
          <FormField
            control={form.control}
            name="deidentificationConfirmed"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2 space-y-0 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                </FormControl>
                <div className="space-y-1">
                  <FormLabel className="!mt-0">I confirm all patient information has been de-identified</FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : existingItem ? "Save Changes" : "Submit for Review"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
