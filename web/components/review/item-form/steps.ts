import type { WizardStatus } from "@/components/shared/wizard/wizard-shell";
import type { WizardIssue } from "@/components/shared/wizard/collect-issues";

export type ReviewFieldStepId = "basics" | "material" | "reviewers";
export type ReviewStepId = ReviewFieldStepId;

export const REVIEW_ITEM_STEPS: { id: ReviewFieldStepId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "material", label: "Material" },
  { id: "reviewers", label: "Reviewers" },
];

/**
 * Which step each form field is edited on — used to attribute schema issues
 * (and dirty fields) to a step. `source` isn't a form field: it stands for the
 * document/link a non-lecture item needs, which the server requires but the
 * Zod schema can't express (the file travels outside the form values).
 */
const FIELD_STEP: Record<string, ReviewFieldStepId> = {
  title: "basics",
  description: "basics",
  contentType: "basics",
  level: "basics",
  categoryIds: "basics",
  tagIds: "basics",
  youtubeUrl: "material",
  externalUrl: "material",
  deidentificationConfirmed: "material",
  source: "material",
  audienceMode: "reviewers",
  invitedUserIds: "reviewers",
  volunteerNote: "reviewers",
};

export function stepForField(field: string): ReviewFieldStepId | undefined {
  return FIELD_STEP[field];
}

export const SOURCE_REQUIRED_MESSAGE = "Add a file or an external link.";

export type ReviewStepStatuses = Record<ReviewStepId, WizardStatus>;
export type ReviewStepIssues = Record<ReviewFieldStepId, WizardIssue[]>;
