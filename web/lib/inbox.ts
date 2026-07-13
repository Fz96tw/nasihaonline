// Client-safe Inbox types (PRD §4.7) — kept separate from inbox-server.ts so
// client components can import them without pulling in the "server-only"
// query logic.
import type { MeetingRequestStatus } from "@/lib/generated/prisma/enums";

/** A row in the inbox list for a message thread — one entry per thread, not per message. */
export type InboxMessageListItem = {
  kind: "message";
  /** The root message's id — also the thread id used by GET/POST /api/inbox/messages. */
  id: string;
  otherPartyId: string;
  otherPartyName: string;
  subject: string | null;
  /** The most recent message's body, truncated. */
  snippet: string;
  /** True if the current user has an unread message anywhere in this thread. */
  unread: boolean;
  /** Timestamp of the thread's most recent message, for "most recent activity" sort. */
  lastActivityAt: string;
};

/**
 * A row in the inbox list for a meeting request (§4.7). Carries its full
 * detail (topic/proposedTimes/message) inline rather than requiring a
 * separate detail fetch — PRD's route list has no GET
 * /api/inbox/meeting-requests/:id, so the list is the only read path.
 */
export type MeetingRequestListItem = {
  kind: "meeting_request";
  id: string;
  otherPartyId: string;
  otherPartyName: string;
  /** Whether the current user sent or received this request. */
  direction: "sent" | "received";
  topic: string;
  message: string | null;
  /** ISO timestamps. */
  proposedTimes: string[];
  status: MeetingRequestStatus;
  /** Timestamp of the request's most recent status change, for "most recent activity" sort. */
  lastActivityAt: string;
};

export type InboxListItem = InboxMessageListItem | MeetingRequestListItem;

/** A single message within a thread's detail pane, in chronological order. */
export type InboxThreadMessage = {
  id: string;
  senderId: string;
  senderName: string;
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
  messages: InboxThreadMessage[];
};
