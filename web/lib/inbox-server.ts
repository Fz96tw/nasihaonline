import "server-only";
import { db } from "@/lib/db";
import type { InboxListItem, InboxThread } from "@/lib/inbox";

const SNIPPET_LENGTH = 140;

function truncate(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > SNIPPET_LENGTH ? `${trimmed.slice(0, SNIPPET_LENGTH).trimEnd()}…` : trimmed;
}

const MESSAGE_INCLUDE = {
  sender: { select: { id: true, name: true } },
  recipient: { select: { id: true, name: true } },
} as const;

const MEETING_REQUEST_INCLUDE = {
  sender: { select: { id: true, name: true } },
  recipient: { select: { id: true, name: true } },
} as const;

/**
 * Every thread is strictly two-party and directory-originated (§4.7) — a
 * reply's parentId is always resolved to the thread's root before it's
 * stored (see resolveThreadRoot), so grouping by `parentId ?? id` is enough
 * to reconstruct threads without a recursive parent-chain walk. Meeting
 * requests carry their own status/detail inline (no threading), and are
 * merged into the same most-recent-activity-sorted list per §4.7.
 */
export async function getInboxList(userId: string): Promise<InboxListItem[]> {
  const [messages, meetingRequests] = await Promise.all([
    db.inboxMessage.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: "asc" },
    }),
    db.meetingRequest.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      include: MEETING_REQUEST_INCLUDE,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  type Message = (typeof messages)[number];
  const threads = new Map<string, Message[]>();
  for (const message of messages) {
    const rootId = message.parentId ?? message.id;
    const group = threads.get(rootId);
    if (group) group.push(message);
    else threads.set(rootId, [message]);
  }

  const items: InboxListItem[] = [];
  for (const [rootId, group] of Array.from(threads.entries())) {
    const root = group.find((message) => message.id === rootId);
    if (!root) continue; // Root wasn't fetched (shouldn't happen — see doc comment).

    const latest = group[group.length - 1];
    const otherParty = root.senderId === userId ? root.recipient : root.sender;
    const unread = group.some((message) => message.recipientId === userId && message.readAt === null);

    items.push({
      kind: "message",
      id: rootId,
      otherPartyId: otherParty.id,
      otherPartyName: otherParty.name ?? "Nasiha Member",
      subject: root.subject,
      snippet: truncate(latest.body),
      unread,
      lastActivityAt: latest.createdAt.toISOString(),
    });
  }

  for (const meetingRequest of meetingRequests) {
    const direction = meetingRequest.senderId === userId ? "sent" : "received";
    const otherParty = direction === "sent" ? meetingRequest.recipient : meetingRequest.sender;

    items.push({
      kind: "meeting_request",
      id: meetingRequest.id,
      otherPartyId: otherParty.id,
      otherPartyName: otherParty.name ?? "Nasiha Member",
      direction,
      topic: meetingRequest.topic,
      message: meetingRequest.message,
      proposedTimes: meetingRequest.proposedTimes.map((time) => time.toISOString()),
      status: meetingRequest.status,
      lastActivityAt: meetingRequest.updatedAt.toISOString(),
    });
  }

  return items.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export class InboxAccessError extends Error {
  constructor(public readonly status: 403 | 404, message: string) {
    super(message);
  }
}

/**
 * Full thread for the detail pane, permission-checked to the two
 * participants. As a side effect, marks every message in the thread
 * addressed to `userId` as read (§4.7 AC2 — opening a thread clears its
 * unread state), since this route is the only read path for thread detail.
 */
export async function getThreadForUser(rootId: string, userId: string): Promise<InboxThread> {
  const root = await db.inboxMessage.findUnique({ where: { id: rootId }, include: MESSAGE_INCLUDE });
  if (!root || root.parentId !== null) throw new InboxAccessError(404, "Thread not found.");
  if (root.senderId !== userId && root.recipientId !== userId) {
    throw new InboxAccessError(403, "You don't have access to this thread.");
  }

  const replies = await db.inboxMessage.findMany({
    where: { parentId: rootId },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });

  const unreadIds = [root, ...replies]
    .filter((message) => message.recipientId === userId && message.readAt === null)
    .map((message) => message.id);
  if (unreadIds.length > 0) {
    await db.inboxMessage.updateMany({ where: { id: { in: unreadIds } }, data: { readAt: new Date() } });
  }

  const otherParty = root.senderId === userId ? root.recipient : root.sender;

  return {
    id: root.id,
    subject: root.subject,
    otherPartyId: otherParty.id,
    otherPartyName: otherParty.name ?? "Nasiha Member",
    messages: [root, ...replies].map((message) => ({
      id: message.id,
      senderId: message.senderId,
      senderName: message.sender.name ?? "Nasiha Member",
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      isOwn: message.senderId === userId,
    })),
  };
}

export class SendMessageError extends Error {
  constructor(public readonly status: 400 | 403 | 404, message: string) {
    super(message);
  }
}

/**
 * Creates a new top-level message (parentId null, explicit recipientId) or
 * a reply (parentId set, recipient derived as "the other party on that
 * thread"). Replies always store the thread's *root* id as parentId, even
 * if the caller passed an intermediate reply's id — this is what makes
 * getInboxList's flat grouping correct and keeps the thread a single
 * email-style list rather than a nested tree.
 */
export async function sendMessage(
  senderId: string,
  input: { recipientId: string | null; subject: string | null; body: string; parentId: string | null },
): Promise<{ id: string; threadId: string }> {
  if (input.parentId === null) {
    const recipientId = input.recipientId;
    if (!recipientId) throw new SendMessageError(400, "Select a recipient");
    if (recipientId === senderId) throw new SendMessageError(400, "You can't message yourself.");

    const recipient = await db.user.findUnique({ where: { id: recipientId } });
    if (!recipient) throw new SendMessageError(404, "Recipient not found.");

    const message = await db.inboxMessage.create({
      data: { senderId, recipientId, subject: input.subject, body: input.body, parentId: null },
    });
    return { id: message.id, threadId: message.id };
  }

  const target = await db.inboxMessage.findUnique({ where: { id: input.parentId } });
  if (!target) throw new SendMessageError(404, "Thread not found.");
  const rootId = target.parentId ?? target.id;
  const root = target.parentId === null ? target : await db.inboxMessage.findUnique({ where: { id: rootId } });
  if (!root) throw new SendMessageError(404, "Thread not found.");
  if (root.senderId !== senderId && root.recipientId !== senderId) {
    throw new SendMessageError(403, "You don't have access to this thread.");
  }

  const recipientId = root.senderId === senderId ? root.recipientId : root.senderId;

  const message = await db.inboxMessage.create({
    data: { senderId, recipientId, subject: null, body: input.body, parentId: rootId },
  });
  return { id: message.id, threadId: rootId };
}
