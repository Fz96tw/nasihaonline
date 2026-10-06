import type { WizardStatus } from "@/components/shared/wizard/wizard-shell";

/** Steps that edit form fields (and so can own schema issues). */
export type EventFieldStepId = "basics" | "when" | "who" | "where";
export type EventStepId = EventFieldStepId | "review";

export const EVENT_STEPS: { id: EventFieldStepId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "when", label: "When" },
  { id: "who", label: "Who" },
  { id: "where", label: "Where" },
];

/** Every wizard step in order, including the final summary/publish step. */
export const EVENT_WIZARD_STEPS: { id: EventStepId; label: string }[] = [
  ...EVENT_STEPS,
  { id: "review", label: "Review" },
];

/** Which step each form field is edited on — used to attribute schema issues (and dirty fields) to a step. */
const FIELD_STEP: Record<string, EventFieldStepId> = {
  title: "basics",
  type: "basics",
  description: "basics",
  deidentificationConfirmed: "basics",
  startsAt: "when",
  endsAt: "when",
  timezone: "when",
  recurrence: "when",
  visibility: "who",
  open: "who",
  guestLinkEnabled: "who",
  invitedUserIds: "who",
  communityIds: "who",
  allCommunities: "who",
  categoryIds: "who",
  meetLinkSource: "where",
  meetingUrl: "where",
  coHostUserIds: "where",
};

export function stepForField(field: string): EventFieldStepId | undefined {
  return FIELD_STEP[field];
}

export type EventStepStatuses = Record<EventStepId, WizardStatus>;

export type EventStepIssues = Record<EventFieldStepId, { path: string; message: string }[]>;
