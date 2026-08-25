import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { NotificationType, PastedImageOwnerType } from "@/lib/generated/prisma/enums";
import type { InboxListItem, InboxThread } from "@/lib/inbox";
import { sendInboxMessageEmail } from "@/lib/email";
import { INBOX_TIERS } from "@/lib/members";
import { createNotification } from "@/lib/notifications-server";
import { getMeetingMessageImageUrl, getProfileAvatarUrl } from "@/lib/storage";
import { countPastedImageReferences, linkPastedImages, MAX_PASTED_IMAGES_PER_BODY } from "@/lib/pasted-images-server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

const SNIPPET_LENGTH = 140;

function truncate(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > SNIPPET_LENGTH ? `${trimmed.slice(0, SNIPPET_LENGTH).trimEnd()}…` : trimmed;
}

const PARTY_SELECT = { id: true, name: true, profile: { select: { avatarUrl: true } } } as const;

const MESSAGE_INCLUDE = {
  sender: { select: PARTY_SELECT },
  recipient: { select: PARTY_SELECT },
} as const;

const MEETING_REQUEST_INCLUDE = {
  sender: { select: PARTY_SELECT },
  recipient: { select: PARTY_SELECT },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { sender: { select: { name: true } } },
  },
  recordings: {
    orderBy: { startedAt: "asc" as const },
    select: { id: true, startedAt: true, objectKey: true, failedAt: true, durationSeconds: true },
  },
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
      otherPartyName: otherParty.name ?? "NASIHA Member",
      otherPartyAvatarUrl: getProfileAvatarUrl(otherParty.profile?.avatarUrl ?? null),
      subject: root.subject,
      snippet: truncate(latest.body),
      searchText: group.map((message) => message.body).join("\n\n"),
      unread,
      lastActivityAt: latest.createdAt.toISOString(),
    });
  }

  for (const meetingRequest of meetingRequests) {
    const direction = meetingRequest.senderId === userId ? "sent" : "received";
    const otherParty = direction === "sent" ? meetingRequest.recipient : meetingRequest.sender;
    const latestMessage = meetingRequest.messages[meetingRequest.messages.length - 1];
    const unread = meetingRequest.messages.some(
      (message) => message.senderId !== userId && message.readAt === null,
    );

    items.push({
      kind: "meeting_request",
      id: meetingRequest.id,
      otherPartyId: otherParty.id,
      otherPartyName: otherParty.name ?? "NASIHA Member",
      otherPartyAvatarUrl: getProfileAvatarUrl(otherParty.profile?.avatarUrl ?? null),
      direction,
      topic: meetingRequest.topic,
      messages: meetingRequest.messages.map((message) => ({
        id: message.id,
        action: message.action,
        senderId: message.senderId,
        senderName: message.sender.name ?? "NASIHA Member",
        body: message.body,
        proposedTimes: message.proposedTimes.map((time) => time.toISOString()),
        createdAt: message.createdAt.toISOString(),
      })),
      searchText: meetingRequest.messages
        .map((message) => message.body)
        .filter((body): body is string => body !== null)
        .join("\n\n"),
      proposedTimes: meetingRequest.proposedTimes.map((time) => time.toISOString()),
      status: meetingRequest.status,
      unread,
      lastActivityAt: (latestMessage?.createdAt ?? meetingRequest.updatedAt).toISOString(),
      scheduledAt: meetingRequest.scheduledAt?.toISOString() ?? null,
      meetingPlatform: meetingRequest.meetingPlatform,
      meetingUrl: meetingRequest.meetingUrl,
      livekitRoomName: meetingRequest.livekitRoomName,
      recordingUrl: meetingRequest.recordingUrl,
      liveKitRecordingSegments: meetingRequest.recordings.map((r) => ({
        id: r.id,
        startedAt: r.startedAt.toISOString(),
        ready: r.objectKey !== null,
        failed: r.failedAt !== null,
        durationSeconds: r.durationSeconds,
      })),
      meetingEndedAt: meetingRequest.meetingEndedAt?.toISOString() ?? null,
      meetingOrganizerMessage: meetingRequest.meetingOrganizerMessage,
      meetingOrganizerMessageImageUrl: getMeetingMessageImageUrl(meetingRequest.meetingOrganizerMessageImageKey),
    });
  }

  return items.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export class InboxAccessError extends Error {
  constructor(public readonly status: 403 | 404, message: string) {
    super(message);
  }
}

const DASHBOARD_INBOX_LIMIT = 5;

/**
 * Dashboard Inbox widget: unread-message count plus the most recent unread
 * messages, mirroring the notification-bell's `readAt: null` count pattern
 * over the same indexed field (`@@index([recipientId, readAt])`). Unlike
 * InboxMessage, MeetingRequestMessage has no recipientId column — a meeting
 * request is always strictly two-party, so "addressed to userId" is
 * `senderId != userId` scoped to requests userId is a party of.
 */
export async function getUnreadInboxSummaryForUser(userId: string) {
  const meetingRequestUnreadWhere: Prisma.MeetingRequestMessageWhereInput = {
    readAt: null,
    senderId: { not: userId },
    meetingRequest: { OR: [{ senderId: userId }, { recipientId: userId }] },
  };

  const [inboxUnreadCount, meetingUnreadCount, unreadMessages, unreadComments] = await Promise.all([
    db.inboxMessage.count({ where: { recipientId: userId, readAt: null } }),
    db.meetingRequestMessage.count({ where: meetingRequestUnreadWhere }),
    db.inboxMessage.findMany({
      where: { recipientId: userId, readAt: null },
      select: {
        id: true,
        subject: true,
        body: true,
        createdAt: true,
        sender: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: DASHBOARD_INBOX_LIMIT,
    }),
    db.meetingRequestMessage.findMany({
      where: meetingRequestUnreadWhere,
      select: {
        body: true,
        createdAt: true,
        sender: { select: { name: true } },
        meetingRequest: { select: { id: true, topic: true } },
      },
      orderBy: { createdAt: "desc" },
      take: DASHBOARD_INBOX_LIMIT,
    }),
  ]);

  const items = [
    ...unreadMessages.map((message) => ({
      id: message.id,
      senderName: message.sender.name ?? "NASIHA Member",
      subject: message.subject,
      snippet: truncate(message.body),
      createdAt: message.createdAt.toISOString(),
    })),
    ...unreadComments.map((comment) => ({
      id: comment.meetingRequest.id,
      senderName: comment.sender.name ?? "NASIHA Member",
      subject: `Meeting: ${comment.meetingRequest.topic}`,
      snippet: truncate(comment.body ?? ""),
      createdAt: comment.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, DASHBOARD_INBOX_LIMIT);

  return {
    unreadCount: inboxUnreadCount + meetingUnreadCount,
    items,
  };
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
    otherPartyName: otherParty.name ?? "NASIHA Member",
    otherPartyAvatarUrl: getProfileAvatarUrl(otherParty.profile?.avatarUrl ?? null),
    messages: [root, ...replies].map((message) => ({
      id: message.id,
      senderId: message.senderId,
      senderName: message.sender.name ?? "NASIHA Member",
      senderAvatarUrl: getProfileAvatarUrl(message.sender.profile?.avatarUrl ?? null),
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      isOwn: message.senderId === userId,
    })),
  };
}

/**
 * Marks a meeting request's unread messages addressed to `userId` as read
 * (mirrors getThreadForUser's read-marking for InboxMessage threads). There's
 * no separate meeting-request detail GET route — the list (getInboxList) is
 * the only read path for its content — so this is called as its own side
 * effect when the client opens a meeting request's detail pane.
 */
export async function markMeetingRequestRead(meetingRequestId: string, userId: string): Promise<void> {
  const meetingRequest = await db.meetingRequest.findUnique({ where: { id: meetingRequestId } });
  if (!meetingRequest) throw new InboxAccessError(404, "Meeting request not found.");
  if (meetingRequest.senderId !== userId && meetingRequest.recipientId !== userId) {
    throw new InboxAccessError(403, "You don't have access to this meeting request.");
  }

  await db.meetingRequestMessage.updateMany({
    where: { meetingRequestId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
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
  if (countPastedImageReferences(input.body, PastedImageOwnerType.inbox_message) > MAX_PASTED_IMAGES_PER_BODY) {
    throw new SendMessageError(400, `A message can reference at most ${MAX_PASTED_IMAGES_PER_BODY} pasted images.`);
  }

  const sender = await db.user.findUnique({ where: { id: senderId }, select: { name: true } });
  const senderName = sender?.name ?? "A member";

  if (input.parentId === null) {
    const recipientId = input.recipientId;
    if (!recipientId) throw new SendMessageError(400, "Select a recipient");
    if (recipientId === senderId) throw new SendMessageError(400, "You can't message yourself.");

    const recipient = await db.user.findUnique({ where: { id: recipientId } });
    if (!recipient || !recipient.tier || !INBOX_TIERS.includes(recipient.tier)) {
      throw new SendMessageError(404, "Recipient not found.");
    }

    const message = await db.inboxMessage.create({
      data: { senderId, recipientId, subject: input.subject, body: input.body, parentId: null },
    });
    await linkPastedImages({
      ownerType: PastedImageOwnerType.inbox_message,
      ownerId: message.id,
      uploaderId: senderId,
      body: input.body,
    });
    const link = `/inbox?item=${message.id}`;
    await createNotification({
      recipientId,
      type: NotificationType.inbox_message,
      message: input.subject ? `${senderName} sent you a message: "${input.subject}"` : `${senderName} sent you a message`,
      link,
    });
    await sendInboxMessageEmail(recipient.email, recipient.name ?? "there", {
      senderName,
      subject: input.subject,
      snippet: truncate(input.body),
      threadUrl: `${APP_URL}${link}`,
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
  const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { email: true, name: true } });

  const message = await db.inboxMessage.create({
    data: { senderId, recipientId, subject: null, body: input.body, parentId: rootId },
  });
  await linkPastedImages({
    ownerType: PastedImageOwnerType.inbox_message,
    ownerId: message.id,
    uploaderId: senderId,
    body: input.body,
  });
  const link = `/inbox?item=${rootId}`;
  await createNotification({
    recipientId,
    type: NotificationType.inbox_message,
    message: `${senderName} replied${root.subject ? ` to "${root.subject}"` : ""}`,
    link,
  });
  if (recipient) {
    await sendInboxMessageEmail(recipient.email, recipient.name ?? "there", {
      senderName,
      subject: root.subject,
      snippet: truncate(input.body),
      threadUrl: `${APP_URL}${link}`,
    });
  }
  return { id: message.id, threadId: rootId };
}
