"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";
import type { ReviewCategoryOption, ReviewItemForEdit, ReviewTagOption } from "@/lib/review";
import { createReviewItemSchema, editReviewItemFormSchema, type CreateReviewItemValues } from "@/lib/validation/review";
import { getCsrfToken } from "@/lib/csrf-client";
import { BasicsStep } from "@/components/review/item-form/basics-step";
import { MaterialStep } from "@/components/review/item-form/material-step";
import { ReviewersStep } from "@/components/review/item-form/reviewers-step";

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
        <BasicsStep form={form} categories={categories} communities={communities} tags={tags} />

        <MaterialStep
          form={form}
          existingItem={existingItem}
          file={file}
          setFile={setFile}
          sourceMode={sourceMode}
          setSourceMode={setSourceMode}
          heroImage={heroImage}
          setHeroImage={setHeroImage}
        />

        {(!existingItem || existingItem.seekingReviewers) && (
          <ReviewersStep form={form} existingItem={existingItem} currentUserId={currentUserId} />
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
