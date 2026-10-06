import type { UseFormReturn } from "react-hook-form";
import { EventVisibility } from "@/lib/generated/prisma/enums";
import { createEventSchema, updateEventSchema, type CreateEventValues } from "@/lib/validation/event";
import { EVENT_STEPS, stepForField, type EventStepId, type EventStepIssues, type EventStepStatuses } from "./steps";

/**
 * Per-step status for the wizard's map, derived from the live form values
 * rather than stored: the same strict schema Publish/Save Changes runs is
 * evaluated on every render, and each issue is attributed to the step that
 * edits its field. "Started" means the host visited the step, changed one of
 * its fields, or is resuming/editing an existing event.
 */
export function useEventStepStatuses({
  form,
  isFirstSubmission,
  isExisting,
  visited,
}: {
  form: UseFormReturn<CreateEventValues>;
  isFirstSubmission: boolean;
  isExisting: boolean;
  visited: ReadonlySet<EventStepId>;
}): { statuses: EventStepStatuses; issuesByStep: EventStepIssues } {
  const values = form.watch();
  const { dirtyFields } = form.formState;

  const result = (isFirstSubmission ? createEventSchema : updateEventSchema).safeParse(values);
  const issuesByStep: EventStepIssues = {
    basics: [],
    when: [],
    who: [],
    where: [],
  };
  if (!result.success) {
    for (const issue of result.error.issues) {
      const step = stepForField(String(issue.path[0]));
      if (step) issuesByStep[step].push({ path: issue.path.join("."), message: issue.message });
    }
  }

  const dirtyStep = new Set(Object.keys(dirtyFields).map(stepForField));
  // "Where" has nothing to fill in unless a restricted event pastes its own link.
  const whereIsOptional = !(values.visibility === EventVisibility.invited && values.meetLinkSource === "manual");

  const statuses = {} as EventStepStatuses;
  for (const { id } of EVENT_STEPS) {
    const issues = issuesByStep[id];
    const started = isExisting || visited.has(id) || dirtyStep.has(id);
    if (started && issues.some((issue) => issue.path === "deidentificationConfirmed")) statuses[id] = "attention";
    else if (issues.length > 0) statuses[id] = started ? "incomplete" : "not_started";
    else if (!started && id === "where" && whereIsOptional) statuses[id] = "optional";
    else statuses[id] = "complete";
  }

  // Review is "ready" only once the host has actually looked at it (or is
  // editing an existing event) and nothing is blocking; any blocker shows once
  // they've reached it.
  const totalIssues = EVENT_STEPS.reduce((sum, { id }) => sum + issuesByStep[id].length, 0);
  const reviewStarted = isExisting || visited.has("review");
  statuses.review = totalIssues > 0 ? (reviewStarted ? "incomplete" : "not_started") : reviewStarted ? "complete" : "not_started";

  return { statuses, issuesByStep };
}
