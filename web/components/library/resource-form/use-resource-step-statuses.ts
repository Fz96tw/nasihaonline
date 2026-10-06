import type { UseFormReturn } from "react-hook-form";
import { KnowledgeContentType } from "@/lib/generated/prisma/enums";
import {
  createKnowledgeItemSchema,
  updateKnowledgeItemSchema,
  type CreateKnowledgeItemValues,
} from "@/lib/validation/knowledge";
import { collectWizardIssues } from "@/components/shared/wizard/collect-issues";
import {
  RESOURCE_STEPS,
  stepForField,
  type ResourceStepId,
  type ResourceStepIssues,
  type ResourceStepStatuses,
} from "./steps";

/**
 * Per-step status for the wizard's map, derived from the live form values
 * rather than stored: the same strict schema "Submit for Review"/"Save Changes"
 * runs is evaluated on every render, and each issue is attributed to the step
 * that edits its field. "Started" means the contributor visited the step,
 * changed one of its fields, or is resuming/editing an existing item.
 */
export function useResourceStepStatuses({
  form,
  isFirstSubmission,
  isExisting,
  visited,
}: {
  form: UseFormReturn<CreateKnowledgeItemValues>;
  isFirstSubmission: boolean;
  isExisting: boolean;
  visited: ReadonlySet<ResourceStepId>;
}): { statuses: ResourceStepStatuses; issuesByStep: ResourceStepIssues } {
  const values = form.watch();
  const { dirtyFields } = form.formState;

  const issues = collectWizardIssues(
    isFirstSubmission ? createKnowledgeItemSchema : updateKnowledgeItemSchema,
    values,
    [
      { field: "title", isEmpty: (v) => !v.title.trim(), value: "placeholder" },
      { field: "contentType", isEmpty: (v) => !v.contentType, value: KnowledgeContentType.article },
    ],
  );
  const issuesByStep: ResourceStepIssues = { basics: [], content: [], audience: [] };
  for (const issue of issues) {
    const step = stepForField(issue.path.split(".")[0]);
    if (step) issuesByStep[step].push(issue);
  }

  const dirtyStep = new Set(Object.keys(dirtyFields).map(stepForField));

  const statuses = {} as ResourceStepStatuses;
  for (const { id } of RESOURCE_STEPS) {
    const stepIssues = issuesByStep[id];
    const started = isExisting || visited.has(id) || dirtyStep.has(id);
    if (started && stepIssues.some((issue) => issue.path === "deidentificationConfirmed")) statuses[id] = "attention";
    else if (stepIssues.length > 0) statuses[id] = started ? "incomplete" : "not_started";
    else statuses[id] = "complete";
  }
  return { statuses, issuesByStep };
}
