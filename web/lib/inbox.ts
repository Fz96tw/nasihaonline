// Client-safe Inbox types (PRD §4.7) — kept separate from inbox-server.ts so
// client components can import them without pulling in the "server-only"
// query logic.

/** A row in the inbox list — one entry per thread, not per message. */
export type InboxListItem = {
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
