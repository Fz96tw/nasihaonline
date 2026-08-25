// Client-safe Inbox types (PRD §4.7) — kept separate from inbox-server.ts so
// client components can import them without pulling in the "server-only"
// query logic.
import type { MeetingRequestMessageAction, MeetingRequestStatus } from "@/lib/generated/prisma/enums";

/** A row in the inbox list for a message thread — one entry per thread, not per message. */
export type InboxMessageListItem = {
  kind: "message";
  /** The root message's id — also the thread id used by GET/POST /api/inbox/messages. */
  id: string;
  otherPartyId: string;
  otherPartyName: string;
  otherPartyAvatarUrl: string | null;
  subject: string | null;
  /** The most recent message's body, truncated. */
  snippet: string;
  /** Every message's body in the thread, concatenated — powers full-thread search (see matchesSearch), not shown in the UI. */
  searchText: string;
  /** True if the current user has an unread message anywhere in this thread. */
  unread: boolean;
  /** Timestamp of the thread's most recent message, for "most recent activity" sort. */
  lastActivityAt: string;
};

/**
 * One step in a meeting request's negotiation timeline (§4.7) — the
 * original ask, each proposed-new-time counter, and the final
 * accept/decline/cancel. Chronological order.
 */
export type MeetingRequestMessageItem = {
  id: string;
  action: MeetingRequestMessageAction;
  senderId: string;
  senderName: string;
  /** Free-text note, if the sender left one — absent for accepted/declined/cancelled. */
  body: string | null;
  /** Only set for created/proposed — the times on offer as of this step, ISO. */
  proposedTimes: string[];
  createdAt: string;
};

/**
 * A row in the inbox list for a meeting request (§4.7). Carries its full
 * detail (topic/proposedTimes/messages) inline rather than requiring a
 * separate detail fetch — PRD's route list has no GET
 * /api/inbox/meeting-requests/:id, so the list is the only read path.
 */
export type MeetingRequestListItem = {
  kind: "meeting_request";
  id: string;
  otherPartyId: string;
  otherPartyName: string;
  otherPartyAvatarUrl: string | null;
  /** Whether the current user sent or received this request. */
  direction: "sent" | "received";
  topic: string;
  /** Full negotiation timeline, chronological — see MeetingRequestMessageItem. */
  messages: MeetingRequestMessageItem[];
  /** Every negotiation step's free-text body, concatenated — powers full-thread search (see matchesSearch), not shown in the UI. */
  searchText: string;
  /** ISO timestamps — the current outstanding proposal. */
  proposedTimes: string[];
  status: MeetingRequestStatus;
  /** True if the current user has an unread comment/negotiation step anywhere in this thread. */
  unread: boolean;
  /** Timestamp of the thread's most recent message (status change or freeform comment), for "most recent activity" sort. */
  lastActivityAt: string;
  /** Set once accepted — the single confirmed time (ISO), chosen from proposedTimes. */
  scheduledAt: string | null;
  /** Set once accepted, if Google Calendar was configured and the call succeeded. */
  meetingUrl: string | null;
  /** Set instead of meetingUrl when the sender chose LiveKit — see MeetingRequest.livekitRoomName's schema comment. */
  livekitRoomName: string | null;
  /** Drive playback link once Google's finished processing the meeting's recording (lib/meeting-recordings-sync.ts) — null until then. */
  recordingUrl: string | null;
  /** LiveKit recording segments (objective 4) — see MemberEvent.liveKitRecordingSegments for the shared rationale, including ready/failed. Each links through /api/inbox/meeting-requests/:id/recording/:recordingId. */
  liveKitRecordingSegments: {
    id: string;
    startedAt: string;
    ready: boolean;
    failed: boolean;
    durationSeconds: number | null;
  }[];
  /** Set once resetMeetingOnRoomEmpty's room_finished handler fires (LiveKit only — Meet has no equivalent signal) — the detail page gates recording-link visibility on this for LiveKit-backed meeting requests instead of the scheduled time. */
  meetingEndedAt: string | null;
  /** Waiting-room greeting shown to the recipient on /meet/request/[id] before Start (meeting-join-experience) — sender-editable via MeetingRequestDetail's inline editor. */
  meetingOrganizerMessage: string | null;
  meetingOrganizerMessageImageUrl: string | null;
};

export type InboxListItem = InboxMessageListItem | MeetingRequestListItem;

/** A single message within a thread's detail pane, in chronological order. */
export type InboxThreadMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  body: string;
  createdAt: string;
  /** True if this message was sent by the current viewer. */
  isOwn: boolean;
};

export type InboxThread = {
  id: string;
  subject: string | null;
  otherPartyId: string;
  otherPartyName: string;
  otherPartyAvatarUrl: string | null;
  messages: InboxThreadMessage[];
};

/**
 * Free-text match over an inbox item — same fields InboxPanel's search box
 * matches against (name/subject-or-topic/full thread text), reused by the
 * What's New feed's server-side search (getFeedPage, lib/feed-server.ts) so
 * the two never drift. `query` must already be lowercased/trimmed by the caller.
 */
export function matchesInboxSearch(item: InboxListItem, query: string): boolean {
  const haystack =
    item.kind === "message"
      ? [item.otherPartyName, item.subject, item.searchText]
      : [item.otherPartyName, item.topic, item.searchText];
  return haystack.some((value) => value?.toLowerCase().includes(query));
}
