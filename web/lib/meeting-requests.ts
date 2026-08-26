// Client-safe MeetingRequest display helpers (PRD §4.7) — kept separate
// from meeting-requests-server.ts so client components can import them
// without pulling in the "server-only" query/mutation logic.
import { MeetingRequestStatus } from "@/lib/generated/prisma/enums";

export const MEETING_REQUEST_STATUS_LABELS: Record<MeetingRequestStatus, string> = {
  [MeetingRequestStatus.pending]: "Pending",
  [MeetingRequestStatus.accepted]: "Accepted",
  [MeetingRequestStatus.declined]: "Declined",
  [MeetingRequestStatus.rescheduled]: "New time proposed",
  [MeetingRequestStatus.cancelled]: "Cancelled",
  [MeetingRequestStatus.reschedule_by_sender]: "New time proposed",
  [MeetingRequestStatus.reschedule_by_recipient]: "New time proposed",
};

export const MEETING_REQUEST_STATUS_BADGE_VARIANT: Record<MeetingRequestStatus, "success" | "warning" | "danger" | "info"> = {
  [MeetingRequestStatus.pending]: "warning",
  [MeetingRequestStatus.accepted]: "success",
  [MeetingRequestStatus.declined]: "danger",
  [MeetingRequestStatus.rescheduled]: "info",
  [MeetingRequestStatus.cancelled]: "danger",
  [MeetingRequestStatus.reschedule_by_sender]: "info",
  [MeetingRequestStatus.reschedule_by_recipient]: "info",
};

/**
 * A meeting request due in the future, for the calendar page's "Upcoming
 * List" (getUpcomingMeetingsForUser in meeting-requests-server.ts). Kept
 * separate from MemberEvent — these are private to the two participants,
 * not the shared community calendar.
 */
export type UpcomingMeeting = {
  id: string;
  topic: string;
  /**
   * ISO timestamp — the confirmed time once accepted, or the earliest
   * still-future proposed time while `isPending`.
   */
  scheduledAt: string;
  meetingUrl: string | null;
  /** Set instead of meetingUrl when the sender chose LiveKit — see MeetingRequest.livekitRoomName's schema comment. */
  livekitRoomName: string | null;
  /** True for pending/rescheduled requests — not yet accepted, so `scheduledAt` is a proposed time, not a confirmed one. */
  isPending: boolean;
  /** True if the viewer sent this request (the organizer); false if they received it. */
  isOrganizer: boolean;
  otherPartyName: string;
  /** Whether a viewable recording exists (Meet recordingUrl, or a ready LiveKit segment) — always false for a still-upcoming meeting. */
  hasRecording: boolean;
};
