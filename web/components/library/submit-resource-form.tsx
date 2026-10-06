"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { KnowledgeContentType, KnowledgeStatus, KnowledgeVisibility } from "@/lib/generated/prisma/enums";
import { type KnowledgeCategoryOption, type KnowledgeItemForEdit, type KnowledgeTagOption } from "@/lib/library";
import {
  createKnowledgeItemSchema,
  draftKnowledgeItemSchema,
  updateKnowledgeItemSchema,
  type CreateKnowledgeItemValues,
} from "@/lib/validation/knowledge";
import { getCsrfToken } from "@/lib/csrf-client";
import { DeleteLibraryItemButton } from "@/components/library/delete-library-item-button";
import { BasicsStep } from "@/components/library/resource-form/basics-step";
import { ContentStep } from "@/components/library/resource-form/content-step";
import { AudienceStep } from "@/components/library/resource-form/audience-step";
import {
  RESOURCE_STEPS,
  REVIEW_STEP,
  stepForField,
  type ResourceFieldStepId,
  type ResourceStepId,
} from "@/components/library/resource-form/steps";
import { ReviewStep } from "@/components/library/resource-form/review-step";
import { useResourceStepStatuses } from "@/components/library/resource-form/use-resource-step-statuses";
import { WizardPanel, WizardShell, type WizardNavSource } from "@/components/shared/wizard/wizard-shell";

const DEFAULT_VALUES: CreateKnowledgeItemValues = {
  title: "",
  body: null,
  contentType: "" as KnowledgeContentType,
  level: null,
  communityIds: [],
  categoryIds: [],
  tagIds: [],
  youtubeUrl: null,
  externalUrl: null,
  deidentificationConfirmed: false,
  showTitleOverlay: false,
  licenseConsented: false,
  visibility: KnowledgeVisibility.public,
  invitedUserIds: [],
};

/**
 * "Submit Resource" form (§4.9), posted from /library/new, and reused from
 * /library/[id]/edit when `existingItem` is supplied. Keeps using
 * CreateKnowledgeItemValues as its RHF value type in every mode (rather than
 * a separate edit-mode type) — same simplification as WritePostForm. Every
 * content type shares one rich-text `body` field (TiptapEditor) right after
 * Title; the short `description` shown on cards/search is always derived
 * from it server-side (excerptFromHtml), never typed here. contentType then
 * drives the remaining source-specific field, mutually exclusive with body:
 * a YouTube URL input for recorded_lecture, a `sourceMode` toggle between a
 * file input and an `externalUrl` input for every other non-blog type
 * (mutually exclusive — toggling clears the other, with an edit able to
 * leave the existing attachment in place instead of replacing it), or
 * nothing extra for blog_post (its content is fully covered by body).
 * case_study additionally requires the de-identification checkbox,
 * re-affirmed on every edit rather than carried forward silently.
 *
 * Restricted Knowledge Library Submissions, Objective 03: `visibility` is a
 * 2-way choice (public / restricted), mirroring SubmitEventForm's audience
 * picker — normally create-only (edit mode hides the section and always
 * submits it as public with no invitees, since editing an already-submitted
 * item can't change it), EXCEPT while `existingItem.status === draft`: a
 * draft's real first submission is deferred to when it's actually submitted
 * for review, so this section (and licenseConsented below) stays visible
 * and editable for as long as the item is still a draft — see
 * `isFirstSubmission` below.
 *
 * Save as Draft initiative: the live RHF resolver is always the lenient
 * `draftKnowledgeItemSchema` (only title+contentType required) so neither
 * button is ever blocked by an incomplete form; "Submit for Review"/"Save
 * Changes" instead runs the real strict schema (createKnowledgeItemSchema/
 * updateKnowledgeItemSchema) by hand inside onSubmit, mapping any failures
 * onto the form via setError. "Save Draft" skips that manual check
 * entirely and posts with `action: "draft"`.
 */
export function SubmitResourceForm({
  categories,
  communities,
  tags,
  existingItem,
  currentUserId,
  initialContentType,
}: {
  categories: KnowledgeCategoryOption[];
  communities: { id: string; name: string }[];
  tags: KnowledgeTagOption[];
  existingItem?: KnowledgeItemForEdit;
  /** Current user's id — excludes them from the invitee picker's suggestions (create mode only). */
  currentUserId?: string;
  /** Preselects the content-type dropdown in create mode (e.g. `?type=` on /library/new) — ignored when editing, since existingItem.contentType already wins. */
  initialContentType?: KnowledgeContentType;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceMode, setSourceMode] = useState<"file" | "link">(existingItem?.externalUrl ? "link" : "file");
  const [heroImage, setHeroImage] = useState<File | null>(null);
  // Which button was actually clicked — read synchronously inside onSubmit
  // (a ref, not state, since RHF's handleSubmit fires in the same
  // click→submit cycle a state update wouldn't be visible in yet).
  const pendingActionRef = useRef<"draft" | "submit">("submit");
  // "Save Draft" on an existing draft stays on this same page (no
  // navigation, so the SavedBanner-on-redirect convention every other save
  // in this app uses doesn't fire) — this is the only in-component
  // confirmation for that one case. Cleared on the next submit attempt.
  const [draftSaved, setDraftSaved] = useState(false);

  // A draft's visibility/invitedUserIds/licenseConsented are genuinely
  // still being decided — this is its real first submission, deferred from
  // creation — so those fields behave exactly like brand-new-item mode
  // (rendered + required) for as long as the item stays a draft.
  const isFirstSubmission = !existingItem || existingItem.status === KnowledgeStatus.draft;

  const form = useForm<CreateKnowledgeItemValues>({
    resolver: zodResolver(draftKnowledgeItemSchema),
    defaultValues: existingItem
      ? {
          title: existingItem.title,
          body: existingItem.body,
          contentType: existingItem.contentType,
          level: existingItem.level,
          // Genuinely editable, like categoryIds below (unlike visibility/
          // invitedUserIds, which stay create-only once past isFirstSubmission).
          communityIds: existingItem.communityIds,
          categoryIds: existingItem.categoryIds,
          tagIds: existingItem.tagIds,
          youtubeUrl: existingItem.youtubeUrl,
          externalUrl: existingItem.externalUrl,
          deidentificationConfirmed: existingItem.deidentificationConfirmed,
          showTitleOverlay: existingItem.showTitleOverlay,
          licenseConsented: isFirstSubmission ? false : true,
          // Visibility isn't editable past a draft's first submission —
          // hidden from the UI and hardcoded here, same "harmless
          // placeholder" pattern as SubmitEventForm's edit-mode
          // invitedUserIds. While still a draft, KnowledgeItemForEdit
          // doesn't carry the real value either (never set yet), so this
          // starts at the same default a new item would.
          visibility: KnowledgeVisibility.public,
          invitedUserIds: [],
        }
      : initialContentType
        ? { ...DEFAULT_VALUES, contentType: initialContentType }
        : DEFAULT_VALUES,
    mode: "onTouched",
  });

  const contentType = form.watch("contentType");
  const isRecordedLecture = contentType === KnowledgeContentType.recorded_lecture;
  const isCaseStudy = contentType === KnowledgeContentType.case_study;
  const isBlogPost = contentType === KnowledgeContentType.blog_post;

  // Wizard navigation. The step map shows every step and lets the contributor
  // jump to any of them at any time; "Next" only warns (it never blocks) about
  // the step being left, using the same strict schema Submit runs. A
  // submitted item has no Audience step — visibility/invitees/license consent
  // are only editable while the item is still a first submission.
  const [activeStep, setActiveStep] = useState<ResourceStepId>("basics");
  const [visitedSteps, setVisitedSteps] = useState<ReadonlySet<ResourceStepId>>(() => new Set());
  const { statuses: stepStatuses, issuesByStep } = useResourceStepStatuses({
    form,
    isFirstSubmission,
    isExisting: existingItem !== undefined,
    visited: visitedSteps,
  });
  const fieldSteps = RESOURCE_STEPS.filter((step) => step.id !== "audience" || isFirstSubmission);
  const wizardSteps = [...fieldSteps, REVIEW_STEP];

  // Errors set by hand ("Next", or a rejected Submit) are never re-checked by
  // RHF on a plain change — mode "onTouched" only re-validates after a blur,
  // which selects, checkboxes and the pickers never fire. issuesByStep is
  // recomputed from the live values on every render, so drop any error whose
  // field no longer fails the strict schema.
  const formErrors = form.formState.errors;
  const failingFields = new Set(
    RESOURCE_STEPS.flatMap((step) => issuesByStep[step.id].map((issue) => issue.path.split(".")[0])),
  );
  useEffect(() => {
    for (const field of Object.keys(formErrors)) {
      if (!failingFields.has(field)) form.clearErrors(field as keyof CreateKnowledgeItemValues);
    }
  });

  function handleStepSelect(id: string, source: WizardNavSource) {
    const leaving = activeStep;
    setVisitedSteps((prev) => new Set(prev).add(leaving).add(id as ResourceStepId));
    if (source === "next") {
      for (const issue of issuesByStep[leaving as ResourceFieldStepId] ?? []) {
        form.setError(issue.path as keyof CreateKnowledgeItemValues, { message: issue.message });
      }
    }
    setActiveStep(id as ResourceStepId);
  }

  /**
   * A save was rejected for fields the contributor may not be looking at
   * (every step but the active one is hidden) — bring them to the first step
   * that has a problem. A failed Submit from Review stays put: Review already
   * lists the blocking steps with links.
   */
  function jumpToFirstProblemStep(fieldPaths: string[], { stayOnReview }: { stayOnReview: boolean }) {
    if (stayOnReview && activeStep === "review") return;
    const failing = new Set(fieldPaths.map((path) => stepForField(path.split(".")[0])));
    const target = fieldSteps.find((step) => failing.has(step.id));
    if (target) setActiveStep(target.id);
  }

  function onInvalid(errors: FieldErrors<CreateKnowledgeItemValues>) {
    jumpToFirstProblemStep(Object.keys(errors), { stayOnReview: false });
  }

  async function onSubmit(values: CreateKnowledgeItemValues) {
    const action = pendingActionRef.current;

    // The live RHF resolver (draftKnowledgeItemSchema) is deliberately
    // lenient so neither button is ever blocked mid-edit — "Submit for
    // Review"/"Save Changes" instead runs the real strict schema here, by
    // hand, only when that's the button that was actually clicked.
    if (action === "submit") {
      const strictSchema = isFirstSubmission ? createKnowledgeItemSchema : updateKnowledgeItemSchema;
      const result = strictSchema.safeParse(values);
      if (!result.success) {
        for (const issue of result.error.issues) {
          form.setError(issue.path.join(".") as keyof CreateKnowledgeItemValues, { message: issue.message });
        }
        jumpToFirstProblemStep(
          result.error.issues.map((issue) => issue.path.join(".")),
          { stayOnReview: true },
        );
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    setDraftSaved(false);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      formData.append("action", action);
      formData.append("title", values.title);
      if (values.body) formData.append("body", values.body);
      formData.append("contentType", values.contentType);
      if (values.level) formData.append("level", values.level);
      // Genuinely editable — sent unconditionally, unlike visibility/
      // invitedUserIds below which stop being sent once isFirstSubmission
      // goes false.
      values.communityIds.forEach((communityId) => formData.append("communityIds", communityId));
      values.categoryIds.forEach((categoryId) => formData.append("categoryIds", categoryId));
      values.tagIds.forEach((tagId) => formData.append("tagIds", tagId));
      if (values.youtubeUrl) formData.append("youtubeUrl", values.youtubeUrl);
      const requiresAttachmentOrLink = !isRecordedLecture && !isBlogPost;
      if (requiresAttachmentOrLink && sourceMode === "link" && values.externalUrl) {
        formData.append("externalUrl", values.externalUrl);
      }
      formData.append("deidentificationConfirmed", String(isCaseStudy && values.deidentificationConfirmed));
      formData.append("showTitleOverlay", String(values.showTitleOverlay));
      if (isFirstSubmission) {
        formData.append("licenseConsented", String(values.licenseConsented));
        formData.append("visibility", values.visibility);
        formData.append("invitedUserIds", JSON.stringify(values.invitedUserIds));
      }
      if (requiresAttachmentOrLink && sourceMode === "file" && file) formData.append("file", file);
      if (heroImage) formData.append("heroImage", heroImage);

      const res = await fetch(existingItem ? `/api/library/${existingItem.id}` : "/api/library", {
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

      if (action === "draft") {
        if (existingItem) {
          // Same page, no navigation — the SavedBanner-on-redirect
          // convention every other save here uses never fires, so this is
          // the only confirmation the save actually happened.
          setDraftSaved(true);
        } else {
          // Brand-new draft — the id only exists now, so this is the first
          // point a resumable edit URL is reachable from. Real navigation to
          // a fresh page, so the usual ?saved=1 + SavedBanner convention
          // applies there instead.
          const created = (await res.json().catch(() => null)) as { id: string } | null;
          if (created?.id) router.replace(`/library/${created.id}/edit?saved=1`);
        }
        router.refresh();
        return;
      }

      if (existingItem) {
        // A draft's real first submission, or a rejected item's
        // resubmission, flips status to pending_review server-side (see
        // updateKnowledgeItem's nextStatus logic) — the public detail page
        // only ever shows published/flagged items and 404s on anything
        // else, even for the item's own contributor. Send those back to
        // the edit page instead; only an already-published item (a plain
        // "Save Changes" edit that doesn't change status) is safe to send
        // to its own detail page.
        const willBePendingReview =
          existingItem.status === KnowledgeStatus.draft || existingItem.status === KnowledgeStatus.rejected;
        // Replace (not push) so this edit page's history entry doesn't
        // linger for BackLink's router.back() on the details page to land
        // on — same rationale as WritePostForm/EditThreadForm.
        router.replace(
          willBePendingReview ? `/library/${existingItem.id}/edit?saved=1` : `/library/${existingItem.id}?saved=1`,
        );
      } else {
        router.push("/library/mine");
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
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-5" noValidate>
        <WizardShell
          steps={wizardSteps.map((step) => ({ ...step, status: stepStatuses[step.id] }))}
          activeId={activeStep}
          onSelect={handleStepSelect}
        >
          <WizardPanel id="basics">
            <BasicsStep form={form} communities={communities} categories={categories} tags={tags} />
          </WizardPanel>

          <WizardPanel id="content">
            <ContentStep
              form={form}
              existingItem={existingItem}
              setImageUploading={setImageUploading}
              file={file}
              setFile={setFile}
              sourceMode={sourceMode}
              setSourceMode={setSourceMode}
              heroImage={heroImage}
              setHeroImage={setHeroImage}
            />
          </WizardPanel>

          {isFirstSubmission && (
            <WizardPanel id="audience">
              <AudienceStep form={form} currentUserId={currentUserId} />
            </WizardPanel>
          )}

          <WizardPanel id="review">
            <ReviewStep
              form={form}
              existingItem={existingItem}
              isFirstSubmission={isFirstSubmission}
              communities={communities}
              categories={categories}
              tags={tags}
              issuesByStep={issuesByStep}
              statuses={stepStatuses}
              file={file}
              sourceMode={sourceMode}
              heroImage={heroImage}
              onEdit={(id) => handleStepSelect(id, "map")}
            />
          </WizardPanel>
        </WizardShell>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {draftSaved && <p className="text-sm text-success">Draft saved.</p>}

        <div className="flex items-center gap-3">
          {isFirstSubmission && (
            <Button
              type="submit"
              variant="outline"
              disabled={submitting || imageUploading}
              onClick={() => {
                pendingActionRef.current = "draft";
              }}
            >
              {submitting && pendingActionRef.current === "draft" ? "Saving…" : "Save Draft"}
            </Button>
          )}
          {/* A new item (or a draft) is submitted for review from the Review step
            only; an already-submitted item's edit can be saved from any step,
            since every step starts out complete there. */}
          {(activeStep === "review" || !isFirstSubmission) && (
            <Button
              type="submit"
              disabled={submitting || imageUploading}
              onClick={() => {
                pendingActionRef.current = "submit";
              }}
            >
              {submitting && pendingActionRef.current === "submit"
                ? "Saving…"
                : isFirstSubmission
                  ? "Submit for Review"
                  : "Save Changes"}
            </Button>
          )}
          {existingItem?.status === KnowledgeStatus.draft && (
            <DeleteLibraryItemButton
              itemId={existingItem.id}
              title={existingItem.title}
              hasEarnedHours={false}
              redirectTo="/library/mine"
            />
          )}
        </div>
      </form>
    </Form>
  );
}
