import type { UseFormReturn } from "react-hook-form";
import { KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";
import { createReviewItemSchema, editReviewItemFormSchema, type CreateReviewItemValues } from "@/lib/validation/review";
import { collectWizardIssues, type WizardIssue } from "@/components/shared/wizard/collect-issues";
import {
  REVIEW_ITEM_STEPS,
  SOURCE_REQUIRED_MESSAGE,
  stepForField,
  type ReviewFieldStepId,
  type ReviewStepIssues,
  type ReviewStepStatuses,
} from "./steps";

/**
 * Per-step status for the wizard's map, derived from the live form values
 * rather than stored: the same schema the form's resolver uses is evaluated on
 * every render, and each issue is attributed to the step that edits its field.
 * "Started" means the member visited the step, changed one of its fields, or is
 * editing an existing item. `hasSource` is whether a non-lecture item has a
 * file or link — the server requires one, but it isn't in the schema.
 */
export function useReviewStepStatuses({
  form,
  isEditing,
  hasSource,
  visited,
}: {
  form: UseFormReturn<CreateReviewItemValues>;
  isEditing: boolean;
  hasSource: boolean;
  visited: ReadonlySet<ReviewFieldStepId>;
}): { statuses: ReviewStepStatuses; issuesByStep: ReviewStepIssues } {
  const values = form.watch();
  const { dirtyFields } = form.formState;

  const issues: WizardIssue[] = collectWizardIssues(isEditing ? editReviewItemFormSchema : createReviewItemSchema, values, [
    { field: "contentType", isEmpty: (v) => !v.contentType, value: KnowledgeContentType.article },
    { field: "level", isEmpty: (v) => !v.level, value: Object.values(KnowledgeLevel)[0] },
  ]);
  if (values.contentType && values.contentType !== KnowledgeContentType.recorded_lecture && !hasSource) {
    issues.push({ path: "source", message: SOURCE_REQUIRED_MESSAGE });
  }

  const issuesByStep: ReviewStepIssues = { basics: [], material: [], reviewers: [] };
  for (const issue of issues) {
    const step = stepForField(issue.path.split(".")[0]);
    if (step) issuesByStep[step].push(issue);
  }

  const dirtyStep = new Set(Object.keys(dirtyFields).map(stepForField));
  // An open call has nothing to fill in on the Reviewers step.
  const reviewersIsOptional = values.audienceMode === "volunteers";

  const statuses = {} as ReviewStepStatuses;
  for (const { id } of REVIEW_ITEM_STEPS) {
    const stepIssues = issuesByStep[id];
    const started = isEditing || visited.has(id) || dirtyStep.has(id);
    if (started && stepIssues.some((issue) => issue.path === "deidentificationConfirmed")) statuses[id] = "attention";
    else if (stepIssues.length > 0) statuses[id] = started ? "incomplete" : "not_started";
    else if (!started && id === "reviewers" && reviewersIsOptional) statuses[id] = "optional";
    else statuses[id] = "complete";
  }
  return { statuses, issuesByStep };
}
