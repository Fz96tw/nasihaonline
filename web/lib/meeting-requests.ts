// Client-safe MeetingRequest display helpers (PRD §4.7) — kept separate
// from meeting-requests-server.ts so client components can import them
// without pulling in the "server-only" query/mutation logic.
import { MeetingRequestStatus } from "@/lib/generated/prisma/enums";

export const MEETING_REQUEST_STATUS_LABELS: Record<MeetingRequestStatus, string> = {
  [MeetingRequestStatus.pending]: "Pending",
  [MeetingRequestStatus.accepted]: "Accepted",
  [MeetingRequestStatus.declined]: "Declined",
  [MeetingRequestStatus.rescheduled]: "New time proposed",
};

export const MEETING_REQUEST_STATUS_BADGE_VARIANT: Record<MeetingRequestStatus, "success" | "warning" | "danger" | "info"> = {
  [MeetingRequestStatus.pending]: "warning",
  [MeetingRequestStatus.accepted]: "success",
  [MeetingRequestStatus.declined]: "danger",
  [MeetingRequestStatus.rescheduled]: "info",
};
