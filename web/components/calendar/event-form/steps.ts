import type { WizardStatus } from "@/components/shared/wizard/wizard-shell";

export type EventStepId = "basics" | "when" | "who" | "where";

export const EVENT_STEPS: { id: EventStepId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "when", label: "When" },
  { id: "who", label: "Who" },
  { id: "where", label: "Where" },
];

/** Which step each form field is edited on — used to attribute schema issues (and dirty fields) to a step. */
const FIELD_STEP: Record<string, EventStepId> = {
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

export function stepForField(field: string): EventStepId | undefined {
  return FIELD_STEP[field];
}

export type EventStepStatuses = Record<EventStepId, WizardStatus>;
