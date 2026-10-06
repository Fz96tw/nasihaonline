import type { WizardStatus } from "@/components/shared/wizard/wizard-shell";
import type { WizardIssue } from "@/components/shared/wizard/collect-issues";

/** Steps that edit form fields (and so can own schema issues). */
export type ResourceFieldStepId = "basics" | "content" | "audience";
export type ResourceStepId = ResourceFieldStepId | "review";

export const RESOURCE_STEPS: { id: ResourceFieldStepId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "content", label: "Content" },
  { id: "audience", label: "Audience" },
];

export const REVIEW_STEP = { id: "review" as const, label: "Review" };

/** Which step each form field is edited on — used to attribute schema issues (and dirty fields) to a step. */
const FIELD_STEP: Record<string, ResourceFieldStepId> = {
  contentType: "basics",
  level: "basics",
  title: "basics",
  communityIds: "basics",
  categoryIds: "basics",
  tagIds: "basics",
  body: "content",
  youtubeUrl: "content",
  externalUrl: "content",
  showTitleOverlay: "content",
  deidentificationConfirmed: "content",
  visibility: "audience",
  invitedUserIds: "audience",
  licenseConsented: "audience",
};

export function stepForField(field: string): ResourceFieldStepId | undefined {
  return FIELD_STEP[field];
}

export type ResourceStepStatuses = Record<ResourceStepId, WizardStatus>;
export type ResourceStepIssues = Record<ResourceFieldStepId, WizardIssue[]>;
