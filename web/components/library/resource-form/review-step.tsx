"use client";

import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KnowledgeContentType, KnowledgeVisibility } from "@/lib/generated/prisma/enums";
import {
  CONTENT_TYPE_LABELS,
  LEVEL_LABELS,
  type KnowledgeCategoryOption,
  type KnowledgeItemForEdit,
  type KnowledgeTagOption,
} from "@/lib/library";
import type { CreateKnowledgeItemValues } from "@/lib/validation/knowledge";
import { VISIBILITY_LABELS } from "./shared";
import {
  RESOURCE_STEPS,
  type ResourceFieldStepId,
  type ResourceStepIssues,
  type ResourceStepStatuses,
} from "./steps";

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
  stepId: ResourceFieldStepId;
  issues: ResourceStepIssues[ResourceFieldStepId];
  onEdit: (id: ResourceFieldStepId) => void;
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

function wordCount(html: string | null): number {
  const text = (html ?? "").replace(/<[^>]+>/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * Final wizard step: a read-only summary of every section with an Edit button
 * per section, and — when the strict schema would reject a submit — a list of
 * the blocking steps, each linking back to the step that fixes it. The actual
 * Submit/Save button lives with the form's action row, not here.
 */
export function ReviewStep({
  form,
  existingItem,
  isFirstSubmission,
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
  form: UseFormReturn<CreateKnowledgeItemValues>;
  existingItem?: KnowledgeItemForEdit;
  isFirstSubmission: boolean;
  communities: { id: string; name: string }[];
  categories: KnowledgeCategoryOption[];
  tags: KnowledgeTagOption[];
  issuesByStep: ResourceStepIssues;
  statuses: ResourceStepStatuses;
  file: File | null;
  sourceMode: "file" | "link";
  heroImage: File | null;
  onEdit: (id: ResourceFieldStepId) => void;
}) {
  const values = form.watch();
  const isRecordedLecture = values.contentType === KnowledgeContentType.recorded_lecture;
  const isCaseStudy = values.contentType === KnowledgeContentType.case_study;
  const isBlogPost = values.contentType === KnowledgeContentType.blog_post;
  const isRestricted = values.visibility === KnowledgeVisibility.restricted;
  const blockingSteps = RESOURCE_STEPS.filter((step) => step.id !== "audience" || isFirstSubmission).filter(
    (step) => issuesByStep[step.id].length > 0,
  );
  const verb = isFirstSubmission ? "submit" : "save";

  const names = <T extends { id: string; name: string }>(options: T[], ids: string[]) =>
    options
      .filter((option) => ids.includes(option.id))
      .map((option) => option.name)
      .join(", ");

  const words = wordCount(values.body);
  const source = isBlogPost
    ? null
    : isRecordedLecture
      ? values.youtubeUrl || NOT_SET
      : sourceMode === "link"
        ? values.externalUrl || NOT_SET
        : (file?.name ?? existingItem?.attachment?.fileName ?? NOT_SET);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">Review &amp; {isFirstSubmission ? "submit" : "save"}</h2>

      {blockingSteps.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium">
            {isFirstSubmission
              ? "Fix these before you can submit for review. You can still save a draft."
              : "Fix these before you can save."}
          </p>
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
        <Row label="Content type">{values.contentType ? CONTENT_TYPE_LABELS[values.contentType] : NOT_SET}</Row>
        <Row label="Level">{values.level ? LEVEL_LABELS[values.level] : NOT_SET}</Row>
        <Row label="Communities">{names(communities, values.communityIds) || NOT_SET}</Row>
        <Row label="Categories">{names(categories, values.categoryIds) || "None"}</Row>
        {tags.length > 0 && <Row label="Tags">{names(tags, values.tagIds) || "None"}</Row>}
      </Section>

      <Section title="Content" stepId="content" issues={issuesByStep.content} onEdit={onEdit}>
        <Row label="Written content">{words > 0 ? `${words} word${words === 1 ? "" : "s"}` : NOT_SET}</Row>
        {source !== null && (
          <Row label={isRecordedLecture ? "YouTube video" : sourceMode === "link" ? "External link" : "File"}>
            {source}
          </Row>
        )}
        {!isRecordedLecture && values.youtubeUrl && <Row label="YouTube video">{values.youtubeUrl}</Row>}
        <Row label="Hero image">
          {heroImage ? heroImage.name : existingItem?.heroImageUrl ? "Current image kept" : "None"}
        </Row>
        {isCaseStudy && (
          <Row label="De-identified">{values.deidentificationConfirmed ? "Confirmed" : NOT_SET}</Row>
        )}
      </Section>

      {isFirstSubmission && (
        <Section title="Audience & visibility" stepId="audience" issues={issuesByStep.audience} onEdit={onEdit}>
          <Row label="Access">{VISIBILITY_LABELS[values.visibility]}</Row>
          {isRestricted && (
            <Row label="Invited">
              {values.invitedUserIds.length > 0 ? `${values.invitedUserIds.length} member(s)` : NOT_SET}
            </Row>
          )}
          <Row label="License">{values.licenseConsented ? "Acknowledged" : NOT_SET}</Row>
        </Section>
      )}
    </section>
  );
}
