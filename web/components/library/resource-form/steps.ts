import type { WizardStatus } from "@/components/shared/wizard/wizard-shell";
import type { WizardIssue } from "@/components/shared/wizard/collect-issues";

export type ResourceStepId = "basics" | "content" | "audience";

export const RESOURCE_STEPS: { id: ResourceStepId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "content", label: "Content" },
  { id: "audience", label: "Audience" },
];

/** Which step each form field is edited on — used to attribute schema issues (and dirty fields) to a step. */
const FIELD_STEP: Record<string, ResourceStepId> = {
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

export function stepForField(field: string): ResourceStepId | undefined {
  return FIELD_STEP[field];
}

export type ResourceStepStatuses = Record<ResourceStepId, WizardStatus>;
export type ResourceStepIssues = Record<ResourceStepId, WizardIssue[]>;
