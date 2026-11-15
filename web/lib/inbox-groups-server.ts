import "server-only";
import { db } from "@/lib/db";
import {
  ForumThreadVisibility,
  NotificationType,
  PastedImageOwnerType,
  RecordingOwnerType,
} from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  formatGroupParticipantNames,
  MAX_GROUP_MESSAGE_PARTICIPANTS,
  type GroupMessageListItem,
  type GroupMessageParticipant,
  type GroupMessageThread,
} from "@/lib/inbox";
import { GROUP_MESSAGES_FORUM_NAME, GROUP_MESSAGES_FORUM_SLUG } from "@/lib/forums";
import { INBOX_TIERS } from "@/lib/members";
import { getProfileAvatarUrl } from "@/lib/storage";
import { sendGroupMessageEmail } from "@/lib/email";
import { countPastedImageReferences, linkPastedImages, MAX_PASTED_IMAGES_PER_BODY } from "@/lib/pasted-images-server";
import { countSharedRecordingTargets, linkSharedRecording } from "@/lib/quick-recordings-server";

/**
 * Inbox group messages (PRD §4.7). A group message is a restricted
 * (`invited`) standalone ForumThread with isGroupMessage set, kept in a
 * hidden, inactive Group Messages forum. Participants are the thread's
 * author plus its ForumThreadInvitee rows. Replies, edits, deletes and
 * flags go through the ordinary forum post routes (createForumPost knows
 * to notify a group differently); everything that *lists* threads excludes
 * isGroupMessage, so a group only ever surfaces in the Inbox.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const SNIPPET_LENGTH = 140;
/** At most one new-message email per group per participant in this window (§4.7). */
export const GROUP_EMAIL_THROTTLE_MS = 3 * 60 * 60 * 1000;

export class GroupMessageError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

function truncate(body: string): string {
  const trimmed = body.trim();
  return trimmed.length > SNIPPET_LENGTH ? `${trimmed.slice(0, SNIPPET_LENGTH).trimEnd()}…` : trimmed;
}

export function groupMessageLink(threadId: string): string {
  return `/inbox?item=${threadId}`;
}

const PARTY_SELECT = { id: true, name: true, profile: { select: { avatarUrl: true } } } as const;

function toParticipant(user: { id: string; name: string | null; profile: { avatarUrl: string | null } | null }): GroupMessageParticipant {
  return {
    id: user.id,
    name: user.name ?? "NASIHA Member",
    avatarUrl: getProfileAvatarUrl(user.profile?.avatarUrl ?? null),
  };
}

/** Threads `userId` takes part in — the author or an invitee — that are live group messages. */
function participantWhere(userId: string): Prisma.ForumThreadWhereInput {
  return {
    isGroupMessage: true,
    removed: false,
    OR: [{ authorId: userId }, { invitees: { some: { userId } } }],
  };
}

/**
 * The hidden forum every group message lives in, created on first use.
 * Inactive, so getForumCategories/getForumBySlug/createForumThread and the
 * public-thread filter all treat it as nonexistent without special-casing.
 */
async function getGroupMessagesForumId(): Promise<string> {
  const forum = await db.forum.upsert({
    where: { slug: GROUP_MESSAGES_FORUM_SLUG },
    update: {},
    create: {
      name: GROUP_MESSAGES_FORUM_NAME,
      slug: GROUP_MESSAGES_FORUM_SLUG,
      description: "Private Inbox group messages. Never listed or browsable.",
      active: false,
      displayOrder: 9999,
    },
    select: { id: true },
  });
  return forum.id;
}

/** Inbox-eligible, directory-listed, unsuspended members among `ids` — the same set the Inbox picker offers. */
async function resolveEligibleRecipients(ids: string[], excludeIds: string[]) {
  if (ids.length === 0) return [];
  return db.user.findMany({
    where: {
      id: { in: ids, notIn: excludeIds },
      tier: { in: INBOX_TIERS },
      suspended: false,
      profile: { listInDirectory: true },
    },
    select: { id: true, name: true, email: true },
  });
}

/** Members among `userIds` who turned off Inbox emails (the inbox_message preference covers groups too). */
async function getEmailOptedOutIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.notificationPreference.findMany({
    where: { userId: { in: userIds }, type: NotificationType.inbox_message, optedOut: true },
    select: { userId: true },
  });
  return new Set(rows.map((row) => row.userId));
}

async function markEmailed(threadId: string, userIds: string[], at: Date): Promise<void> {
  if (userIds.length === 0) return;
  await db.threadView.createMany({ data: userIds.map((userId) => ({ threadId, userId })), skipDuplicates: true });
  await db.threadView.updateMany({ where: { threadId, userId: { in: userIds } }, data: { lastEmailedAt: at } });
}

/**
 * Bell + email for members who were just put in a group — at creation
 * ("started a group message with you") or added later ("added you").
 * Sets each recipient's lastEmailedAt, so the follow-up messages don't
 * email them again until they've opened the group (§4.7 throttle).
 */
export async function notifyAddedToGroup(params: {
  threadId: string;
  subject: string;
  actorName: string;
  userIds: string[];
  kind: "started" | "added";
  firstMessage?: string;
}): Promise<void> {
  if (params.userIds.length === 0) return;
  const link = groupMessageLink(params.threadId);
  const message =
    params.kind === "started"
      ? `${params.actorName} started a group message with you: "${params.subject}"`
      : `${params.actorName} added you to a group message: "${params.subject}"`;
  await db.notification.createMany({
    data: params.userIds.map((recipientId) => ({ recipientId, type: NotificationType.group_message, message, link })),
  });

  const [users, optedOut] = await Promise.all([
    db.user.findMany({
      where: { id: { in: params.userIds }, suspended: false },
      select: { id: true, email: true, name: true },
    }),
    getEmailOptedOutIds(params.userIds),
  ]);
  const recipients = users.filter((user) => !optedOut.has(user.id));
  await Promise.all(
    recipients.map((user) =>
      sendGroupMessageEmail(user.email, user.name ?? "there", {
        kind: params.kind,
        senderName: params.actorName,
        subject: params.subject,
        snippet: params.firstMessage ? truncate(params.firstMessage) : null,
        threadUrl: `${APP_URL}${link}`,
      }),
    ),
  );
  await markEmailed(params.threadId, recipients.map((user) => user.id), new Date());
}

/**
 * Throttled new-message email for a group (§4.7): a participant is emailed
 * only if they haven't been emailed about this group since they last read
 * it, and at most once per GROUP_EMAIL_THROTTLE_MS. The claim is an atomic
 * conditional updateMany, so two near-simultaneous posts can't both email
 * the same person. Returns the ids that were emailed.
 */
export async function emailGroupParticipantsAboutPost(params: {
  threadId: string;
  subject: string;
  senderName: string;
  body: string;
  recipientIds: string[];
  now?: Date;
}): Promise<string[]> {
  if (params.recipientIds.length === 0) return [];
  const now = params.now ?? new Date();
  const [users, optedOut] = await Promise.all([
    db.user.findMany({
      where: { id: { in: params.recipientIds }, suspended: false },
      select: { id: true, email: true, name: true },
    }),
    getEmailOptedOutIds(params.recipientIds),
  ]);
  const candidates = users.filter((user) => !optedOut.has(user.id));
  if (candidates.length === 0) return [];

  await db.threadView.createMany({
    data: candidates.map((user) => ({ threadId: params.threadId, userId: user.id })),
    skipDuplicates: true,
  });

  const throttleCutoff = new Date(now.getTime() - GROUP_EMAIL_THROTTLE_MS);
  const emailed: string[] = [];
  const link = groupMessageLink(params.threadId);
  for (const user of candidates) {
    const claimed = await db.threadView.updateMany({
      where: {
        threadId: params.threadId,
        userId: user.id,
        OR: [
          { lastEmailedAt: null },
          {
            lastEmailedAt: { lt: throttleCutoff },
            lastReadAt: { gt: db.threadView.fields.lastEmailedAt },
          },
        ],
      },
      data: { lastEmailedAt: now },
    });
    if (claimed.count === 0) continue;
    emailed.push(user.id);
    await sendGroupMessageEmail(user.email, user.name ?? "there", {
      kind: "message",
      senderName: params.senderName,
      subject: params.subject,
      snippet: truncate(params.body),
      threadUrl: `${APP_URL}${link}`,
    });
  }
  return emailed;
}

/** Sets `userId`'s read marker on a group to `at` (opening it, or posting in it). */
export async function markGroupMessageRead(threadId: string, userId: string, at = new Date()): Promise<void> {
  await db.threadView.upsert({
    where: { threadId_userId: { threadId, userId } },
    create: { threadId, userId, lastReadAt: at },
    update: { lastReadAt: at },
  });
}

/**
 * POST /api/inbox/groups — creates a group message from the Inbox composer
 * when two or more recipients are picked (§4.7). Recipients are re-resolved
 * against Inbox eligibility rather than trusting the picker; if fewer than
 * two survive, it's rejected rather than silently sent as a direct message.
 */
export async function createGroupMessage(
  senderId: string,
  input: { recipientIds: string[]; subject: string; body: string },
): Promise<{ id: string }> {
  if (countPastedImageReferences(input.body, PastedImageOwnerType.forum_post) > MAX_PASTED_IMAGES_PER_BODY) {
    throw new GroupMessageError(400, `A message can reference at most ${MAX_PASTED_IMAGES_PER_BODY} pasted images.`);
  }
  if (countSharedRecordingTargets(input.body) > 1) {
    throw new GroupMessageError(400, "A message can reference at most one shared video.");
  }

  const uniqueIds = Array.from(new Set(input.recipientIds));
  if (uniqueIds.length + 1 > MAX_GROUP_MESSAGE_PARTICIPANTS) {
    throw new GroupMessageError(400, `A group message can have at most ${MAX_GROUP_MESSAGE_PARTICIPANTS} people, you included.`);
  }
  const recipients = await resolveEligibleRecipients(uniqueIds, [senderId]);
  if (recipients.length < 2) {
    throw new GroupMessageError(400, "Pick at least two members for a group message.");
  }

  const [forumId, sender] = await Promise.all([
    getGroupMessagesForumId(),
    db.user.findUnique({ where: { id: senderId }, select: { name: true } }),
  ]);
  const senderName = sender?.name ?? "A member";

  const thread = await db.forumThread.create({
    data: {
      forumId,
      authorId: senderId,
      title: input.subject,
      visibility: ForumThreadVisibility.invited,
      isGroupMessage: true,
      posts: { create: { authorId: senderId, body: input.body } },
      invitees: { create: recipients.map((user) => ({ userId: user.id })) },
    },
    select: { id: true, createdAt: true, posts: { select: { id: true } } },
  });

  await linkPastedImages({
    ownerType: PastedImageOwnerType.forum_post,
    ownerId: thread.posts[0].id,
    uploaderId: senderId,
    body: input.body,
  });
  await linkSharedRecording({
    ownerType: RecordingOwnerType.forum_post,
    ownerId: thread.posts[0].id,
    uploaderId: senderId,
    body: input.body,
  });
  await markGroupMessageRead(thread.id, senderId, thread.createdAt);
  await notifyAddedToGroup({
    threadId: thread.id,
    subject: input.subject,
    actorName: senderName,
    userIds: recipients.map((user) => user.id),
    kind: "started",
    firstMessage: input.body,
  });

  return { id: thread.id };
}

const GROUP_LIST_SELECT = (userId: string) =>
  ({
    id: true,
    title: true,
    authorId: true,
    createdAt: true,
    author: { select: PARTY_SELECT },
    invitees: { select: { user: { select: PARTY_SELECT } }, orderBy: { createdAt: "asc" } },
    posts: {
      select: { body: true, authorId: true, removed: true, createdAt: true, author: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    },
    views: { where: { userId }, select: { lastReadAt: true } },
  }) satisfies Prisma.ForumThreadSelect;

/** True when `posts` has a live post by someone other than `userId` newer than their read marker. */
function isUnread(
  posts: { authorId: string; removed: boolean; createdAt: Date }[],
  userId: string,
  lastReadAt: Date | null,
): boolean {
  return posts.some(
    (post) => post.authorId !== userId && !post.removed && (!lastReadAt || post.createdAt > lastReadAt),
  );
}

/** Every group message `userId` is in, as Inbox list rows (§4.7). Merged into getInboxList. */
export async function getGroupMessageListItems(userId: string): Promise<GroupMessageListItem[]> {
  const threads = await db.forumThread.findMany({
    where: participantWhere(userId),
    select: GROUP_LIST_SELECT(userId),
  });

  return threads.map((thread) => {
    const participants = [toParticipant(thread.author), ...thread.invitees.map((invitee) => toParticipant(invitee.user))];
    const livePosts = thread.posts.filter((post) => !post.removed);
    const latest = livePosts[livePosts.length - 1] ?? thread.posts[thread.posts.length - 1];
    const latestOther = [...livePosts].reverse().find((post) => post.authorId !== userId);
    const face =
      participants.find((participant) => participant.id === latestOther?.authorId) ??
      participants.find((participant) => participant.id !== userId) ??
      participants[0];
    const latestSender = latest
      ? latest.authorId === userId
        ? "You"
        : (latest.author.name ?? "NASIHA Member").split(" ")[0]
      : null;

    return {
      kind: "group_message" as const,
      id: thread.id,
      otherPartyId: face.id,
      otherPartyName: formatGroupParticipantNames(participants, userId),
      otherPartyAvatarUrl: face.avatarUrl,
      subject: thread.title,
      participants,
      snippet: latest && latestSender ? `${latestSender}: ${truncate(latest.removed ? "[Removed]" : latest.body)}` : "",
      searchText: livePosts.map((post) => post.body).join("\n\n"),
      unread: isUnread(thread.posts, userId, thread.views[0]?.lastReadAt ?? null),
      lastActivityAt: (latest?.createdAt ?? thread.createdAt).toISOString(),
    };
  });
}

/** Unread group messages for the dashboard Inbox widget — count of unread posts plus a preview per group. */
export async function getUnreadGroupMessageSummary(userId: string): Promise<{
  unreadCount: number;
  items: { id: string; senderName: string; subject: string; snippet: string; createdAt: string }[];
}> {
  const threads = await db.forumThread.findMany({
    where: participantWhere(userId),
    select: GROUP_LIST_SELECT(userId),
  });
  let unreadCount = 0;
  const items: { id: string; senderName: string; subject: string; snippet: string; createdAt: string }[] = [];
  for (const thread of threads) {
    const lastReadAt = thread.views[0]?.lastReadAt ?? null;
    const unreadPosts = thread.posts.filter(
      (post) => post.authorId !== userId && !post.removed && (!lastReadAt || post.createdAt > lastReadAt),
    );
    if (unreadPosts.length === 0) continue;
    unreadCount += unreadPosts.length;
    const latest = unreadPosts[unreadPosts.length - 1];
    items.push({
      id: thread.id,
      senderName: latest.author.name ?? "NASIHA Member",
      subject: thread.title,
      snippet: truncate(latest.body),
      createdAt: latest.createdAt.toISOString(),
    });
  }
  return { unreadCount, items };
}

/**
 * GET /api/inbox/groups/:id — a group's detail pane (§4.7), participants
 * only (404 for anyone else, admins included — moderators reach a flagged
 * group post through the moderation queue). Side effect: marks it read.
 */
export async function getGroupMessageThread(
  threadId: string,
  userId: string,
  isAdmin: boolean,
): Promise<GroupMessageThread> {
  const thread = await db.forumThread.findFirst({
    where: { id: threadId, ...participantWhere(userId) },
    select: {
      id: true,
      title: true,
      authorId: true,
      author: { select: PARTY_SELECT },
      invitees: { select: { user: { select: PARTY_SELECT } }, orderBy: { createdAt: "asc" } },
      posts: {
        select: {
          id: true,
          body: true,
          authorId: true,
          createdAt: true,
          editedAt: true,
          removed: true,
          selfDeleted: true,
          author: { select: PARTY_SELECT },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!thread) throw new GroupMessageError(404, "Group message not found.");

  await markGroupMessageRead(thread.id, userId);

  const participants = [toParticipant(thread.author), ...thread.invitees.map((invitee) => toParticipant(invitee.user))];
  const isAuthor = thread.authorId === userId;
  return {
    id: thread.id,
    subject: thread.title,
    authorId: thread.authorId,
    participants,
    messages: thread.posts.map((post) => ({
      id: post.id,
      senderId: post.authorId,
      senderName: post.author.name ?? "NASIHA Member",
      senderAvatarUrl: getProfileAvatarUrl(post.author.profile?.avatarUrl ?? null),
      body: post.removed ? (post.selfDeleted ? "[Deleted by its author]" : "[Removed by a moderator]") : post.body,
      createdAt: post.createdAt.toISOString(),
      editedAt: post.editedAt?.toISOString() ?? null,
      isOwn: post.authorId === userId,
      removed: post.removed,
    })),
    canManageParticipants: isAuthor || isAdmin,
    canLeave: !isAuthor,
    mentionAllowedIds: participants.map((participant) => participant.id),
  };
}

/**
 * POST /api/inbox/groups/:id/leave — an invitee leaves (§4.7). Their
 * invitee row goes, their past messages stay, nobody is notified. The
 * author can't leave in v1 (§11.24).
 */
export async function leaveGroupMessage(threadId: string, userId: string): Promise<void> {
  const thread = await db.forumThread.findFirst({
    where: { id: threadId, ...participantWhere(userId) },
    select: { authorId: true },
  });
  if (!thread) throw new GroupMessageError(404, "Group message not found.");
  if (thread.authorId === userId) {
    throw new GroupMessageError(400, "You started this group, so you can't leave it.");
  }
  await db.forumThreadInvitee.deleteMany({ where: { threadId, userId } });
}

/** For the forum thread page: whether to send `userId` to this group in the Inbox instead (§4.7). */
export async function getGroupMessageRedirect(threadId: string, userId: string | undefined): Promise<
  { isGroupMessage: false } | { isGroupMessage: true; participantLink: string | null }
> {
  const thread = await db.forumThread.findUnique({ where: { id: threadId }, select: { isGroupMessage: true } });
  if (!thread?.isGroupMessage) return { isGroupMessage: false };
  if (!userId) return { isGroupMessage: true, participantLink: null };
  const isParticipant = (await db.forumThread.count({ where: { id: threadId, ...participantWhere(userId) } })) > 0;
  return { isGroupMessage: true, participantLink: isParticipant ? groupMessageLink(threadId) : null };
}
