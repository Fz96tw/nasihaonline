import type { UseFormReturn } from "react-hook-form";
import { EventType, EventVisibility } from "@/lib/generated/prisma/enums";
import { createEventSchema, updateEventSchema, type CreateEventValues } from "@/lib/validation/event";
import { EVENT_STEPS, stepForField, type EventStepId, type EventStepIssues, type EventStepStatuses } from "./steps";

type Issue = { path: string; message: string };

// Zod skips every superRefine (community required, invitees required for a
// restricted event, case-discussion confirmation, ...) while a base field such
// as the title is still invalid, so a bare safeParse on a half-empty form hides
// most of what's left to do. Run it a second time with placeholders in the
// empty base fields so the cross-field rules also report, then keep the real
// base-field issues from the first pass and everything else from the second.
export function collectIssues(schema: typeof createEventSchema | typeof updateEventSchema, values: CreateEventValues): Issue[] {
  const toIssues = (r: ReturnType<typeof schema.safeParse>): Issue[] =>
    r.success ? [] : r.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

  const real = toIssues(schema.safeParse(values));
  const placeholdered = { ...values };
  const filled = new Set<string>();
  if (!values.title.trim()) {
    placeholdered.title = "placeholder";
    filled.add("title");
  }
  if (!values.type) {
    placeholdered.type = Object.values(EventType)[0];
    filled.add("type");
  }
  if (!values.startsAt.trim()) {
    placeholdered.startsAt = "2000-01-01T00:00";
    filled.add("startsAt");
  }
  if (filled.size === 0) return real;

  const merged = [...real];
  for (const issue of toIssues(schema.safeParse(placeholdered))) {
    const field = issue.path.split(".")[0];
    const seen = merged.some((m) => m.path === issue.path && m.message === issue.message);
    if (!filled.has(field) && !seen) merged.push(issue);
  }
  return merged;
}

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

  const schema = isFirstSubmission ? createEventSchema : updateEventSchema;
  const allIssues = collectIssues(schema, values);
  const issuesByStep: EventStepIssues = { basics: [], when: [], who: [], where: [] };
  for (const issue of allIssues) {
    const step = stepForField(issue.path.split(".")[0]);
    if (step) issuesByStep[step].push(issue);
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
