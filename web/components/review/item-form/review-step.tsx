"use client";

import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KnowledgeContentType } from "@/lib/generated/prisma/enums";
import {
  CONTENT_TYPE_LABELS,
  LEVEL_LABELS,
  type ReviewCategoryOption,
  type ReviewItemForEdit,
  type ReviewTagOption,
} from "@/lib/review";
import type { CreateReviewItemValues } from "@/lib/validation/review";
import { REVIEW_ITEM_STEPS, type ReviewFieldStepId, type ReviewStepIssues, type ReviewStepStatuses } from "./steps";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-36 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

const NOT_SET = <span className="text-muted-foreground">Not set</span>;

function Section({
  title,
  stepId,
  issues,
  onEdit,
  children,
}: {
  title: string;
  stepId: ReviewFieldStepId;
  issues: ReviewStepIssues[ReviewFieldStepId];
  onEdit: (id: ReviewFieldStepId) => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => onEdit(stepId)}>
          Edit
        </Button>
      </div>
      <dl className="flex flex-col gap-2">{children}</dl>
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-destructive">
          {issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Final wizard step: a read-only summary of every section with an Edit button
 * per section, and — when the form's schema would reject a submit — a list of
 * the blocking steps, each linking back to the step that fixes it. The actual
 * Submit/Save button lives with the form's action row, not here. There are no
 * drafts in Peer Review, so Submit is the only way forward.
 */
export function ReviewStep({
  form,
  existingItem,
  showReviewersStep,
  communities,
  categories,
  tags,
  issuesByStep,
  statuses,
  file,
  sourceMode,
  heroImage,
  onEdit,
}: {
  form: UseFormReturn<CreateReviewItemValues>;
  existingItem?: ReviewItemForEdit;
  showReviewersStep: boolean;
  communities: { id: string; name: string }[];
  categories: ReviewCategoryOption[];
  tags: ReviewTagOption[];
  issuesByStep: ReviewStepIssues;
  statuses: ReviewStepStatuses;
  file: File | null;
  sourceMode: "file" | "link";
  heroImage: File | null;
  onEdit: (id: ReviewFieldStepId) => void;
}) {
  const values = form.watch();
  const isRecordedLecture = values.contentType === KnowledgeContentType.recorded_lecture;
  const isCaseStudy = values.contentType === KnowledgeContentType.case_study;
  const isInviteMode = values.audienceMode === "invite";
  const verb = existingItem ? "save" : "submit";
  const blockingSteps = REVIEW_ITEM_STEPS.filter((step) => step.id !== "reviewers" || showReviewersStep).filter(
    (step) => issuesByStep[step.id].length > 0,
  );

  const names = <T extends { id: string; name: string }>(options: T[], ids: string[]) =>
    options
      .filter((option) => ids.includes(option.id))
      .map((option) => option.name)
      .join(", ");
  const communityNames = (() => {
    const selectedCommunityIds = new Set(
      categories.filter((category) => values.categoryIds.includes(category.id)).map((category) => category.communityId),
    );
    return communities
      .filter((community) => selectedCommunityIds.has(community.id))
      .map((community) => community.name)
      .join(", ");
  })();

  const source = isRecordedLecture
    ? values.youtubeUrl || NOT_SET
    : sourceMode === "link"
      ? values.externalUrl || NOT_SET
      : (file?.name ?? existingItem?.attachment?.fileName ?? NOT_SET);
  // Editing an open call keeps its mode — the form doesn't expose changing it.
  const isOpenCall = existingItem ? existingItem.seekingReviewers : !isInviteMode;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Review &amp; {verb}</h2>

      {blockingSteps.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">Fix these before you can {verb}.</p>
          <ul className="flex flex-col gap-1 text-sm">
            {blockingSteps.map((step) => (
              <li key={step.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => onEdit(step.id)}
                >
                  {step.label}
                </button>
                <Badge variant={statuses[step.id] === "attention" ? "danger" : "warning"}>
                  {issuesByStep[step.id].length} to fix
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Everything looks complete. Check the details below, then {verb}.
        </p>
      )}

      <Section title="Basics" stepId="basics" issues={issuesByStep.basics} onEdit={onEdit}>
        <Row label="Title">{values.title.trim() || NOT_SET}</Row>
        <Row label="Description">{values.description.trim() || NOT_SET}</Row>
        <Row label="Content type">{values.contentType ? CONTENT_TYPE_LABELS[values.contentType] : NOT_SET}</Row>
        <Row label="Level">{values.level ? LEVEL_LABELS[values.level] : NOT_SET}</Row>
        <Row label="Categories">{names(categories, values.categoryIds) || NOT_SET}</Row>
        {communityNames && <Row label="Communities">{communityNames}</Row>}
        {tags.length > 0 && <Row label="Tags">{names(tags, values.tagIds) || "None"}</Row>}
      </Section>

      <Section title="Material" stepId="material" issues={issuesByStep.material} onEdit={onEdit}>
        <Row label={isRecordedLecture ? "YouTube video" : sourceMode === "link" ? "External link" : "File"}>
          {values.contentType ? source : NOT_SET}
        </Row>
        <Row label="Hero image">
          {heroImage ? heroImage.name : existingItem?.heroImageUrl ? "Current image kept" : "None"}
        </Row>
        {isCaseStudy && (
          <Row label="De-identified">{values.deidentificationConfirmed ? "Confirmed" : NOT_SET}</Row>
        )}
      </Section>

      {showReviewersStep && (
        <Section title="Reviewers" stepId="reviewers" issues={issuesByStep.reviewers} onEdit={onEdit}>
          {!existingItem && <Row label="Mode">{isInviteMode ? "Select reviewers" : "Request volunteers"}</Row>}
          {!existingItem && isInviteMode && (
            <Row label="Invited">
              {values.invitedUserIds.length > 0 ? `${values.invitedUserIds.length} member(s)` : NOT_SET}
            </Row>
          )}
          {isOpenCall && <Row label="Volunteer note">{values.volunteerNote?.trim() || "None"}</Row>}
        </Section>
      )}
    </section>
  );
}
