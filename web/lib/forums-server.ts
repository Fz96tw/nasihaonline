import "server-only";
import { db } from "@/lib/db";
import { EventVisibility, ForumThreadVisibility, KnowledgeVisibility, NotificationType } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createNotification } from "@/lib/notifications-server";
import { recordAdminAction } from "@/lib/audit-server";
import { searchForumDocuments } from "@/lib/meilisearch";
import { getDirectoryMembersByIds, getMentionableMembers } from "@/lib/members-server";
import { getProfileAvatarUrl } from "@/lib/storage";
import { findMentionedMembers } from "@/lib/mentions";
import { DIRECTORY_TIERS } from "@/lib/members";
import { CLINICAL_DISCUSSIONS_SLUG, EVENTS_FORUM_SLUG, LIBRARY_FORUM_SLUG } from "@/lib/forums";
import type {
  ForumCategory,
  ForumThreadListItem,
  ForumThreadDetail,
  ForumThreadRosterMember,
  ForumPostNode,
  MemberForumThread,
} from "@/lib/forums";

export class ForumError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

/**
 * /forums (§4.13) — the six member-browsable seeded forum categories,
 * admin-manageable but not editable here yet. Excludes Events Discussion and
 * Library Discussions: those two forums only ever get threads on-demand,
 * created from an Event's/Knowledge Library item's own detail page rather
 * than picked by a member browsing here, so listing them as a browsable
 * category would be a dead end (no "new thread" flow reachable from here)
 * and could leak the existence of a thread whose visibility is inherited
 * from a restricted event/item to members who can't see it. Their threads
 * stay reachable via the source item's page and direct
 * /forums/{events,library-discussions}/[threadId] URLs (still subject to
 * getForumThreadDetail's visibility check) — only this index listing hides
 * them. postCount/lastActivityAt are derived from each thread's latest post
 * (every thread has at least one, from creation) so the "most active" /
 * "most recent" sort buttons on the page have something to sort by without
 * a denormalized column on Forum itself.
 */
export async function getForumCategories(): Promise<ForumCategory[]> {
  const forums = await db.forum.findMany({
    where: { active: true, slug: { notIn: [EVENTS_FORUM_SLUG, LIBRARY_FORUM_SLUG] } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      _count: { select: { threads: true } },
      threads: {
        select: {
          _count: { select: { posts: true } },
          posts: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  return forums.map((forum) => {
    const postCount = forum.threads.reduce((sum, thread) => sum + thread._count.posts, 0);
    const lastActivityAt = forum.threads.reduce<Date | null>((latest, thread) => {
      const postDate = thread.posts[0]?.createdAt;
      if (!postDate) return latest;
      return !latest || postDate > latest ? postDate : latest;
    }, null);

    return {
      id: forum.id,
      name: forum.name,
      slug: forum.slug,
      description: forum.description,
      threadCount: forum._count.threads,
      postCount,
      lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
    };
  });
}

// A restricted (invited-only) Event's discussion thread carries the same
// visibility as the event itself (§4.6 extension) — the Events forum has no
// per-thread ACL of its own, so every read path that can surface a thread
// (browse list, search, direct URL, a member's profile, a reply/view POST)
// has to run its result through this before showing or accepting anything.
// A thread with no linked event (every non-Events forum, plus an Events
// forum thread started standalone rather than from event creation) is
// always visible — only an `invited`-visibility event's thread is gated.
export type EventThreadAccess = {
  visibility: EventVisibility;
  hostId: string;
  invitees: { userId: string }[];
} | null;

export const EVENT_THREAD_ACCESS_SELECT = {
  select: { visibility: true, hostId: true, invitees: { select: { userId: true } } },
} as const;

function isEventThreadVisible(event: EventThreadAccess, viewerId: string | undefined): boolean {
  if (!event || event.visibility !== EventVisibility.invited) return true;
  if (!viewerId) return false;
  return event.hostId === viewerId || event.invitees.some((invitee) => invitee.userId === viewerId);
}

// Same idea as EventThreadAccess/isEventThreadVisible above, for a
// restricted Knowledge Library item's on-demand discussion thread
// (§4.9) — mirrors canViewKnowledgeItem in library-server.ts (Authorization
// re-checks, Objective 08): public, the contributor, an invitee, or
// Steward/admin. Every read path that can surface a thread (browse list,
// search, direct URL, a member's profile, a reply/view POST) has to run its
// result through this — a thread with no linked item (every non-Library
// forum, plus a Library thread's parent item being public) is always
// visible; only a `restricted`-visibility item's thread is gated, and a
// removed invitee loses access exactly when they lose it on the item's own
// detail page — Steward/admin retain theirs regardless, same blanket
// moderation visibility as every other Library read path.
export type KnowledgeItemThreadAccess = {
  visibility: KnowledgeVisibility;
  contributorId: string;
  invitees: { userId: string }[];
} | null;

export const KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT = {
  select: { visibility: true, contributorId: true, invitees: { select: { userId: true } } },
} as const;

function isKnowledgeItemThreadVisible(
  item: KnowledgeItemThreadAccess,
  viewerId: string | undefined,
  isPrivileged: boolean,
): boolean {
  if (!item || item.visibility !== KnowledgeVisibility.restricted) return true;
  if (isPrivileged) return true;
  if (!viewerId) return false;
  return item.contributorId === viewerId || item.invitees.some((invitee) => invitee.userId === viewerId);
}

// Member-Initiated Restricted Forum Threads (§4.13/§11.16) — a standalone
// thread's own independently-set restriction, same shape as
// KnowledgeItemThreadAccess above (author takes the contributor/host role,
// isPrivileged still bypasses). Always vacuously visible for a thread with
// an eventId/knowledgeItemId, since createForumThread/
// updateForumThreadInvitees never let a thread carry both inherited and
// member-initiated restriction at once — visibility stays `community` on
// every such thread.
export type OwnThreadAccess = {
  visibility: ForumThreadVisibility;
  authorId: string;
  invitees: { userId: string }[];
};

export const OWN_THREAD_ACCESS_SELECT = {
  visibility: true,
  authorId: true,
  invitees: { select: { userId: true } },
} as const;

function isOwnThreadVisible(thread: OwnThreadAccess, viewerId: string | undefined, isPrivileged: boolean): boolean {
  if (thread.visibility !== ForumThreadVisibility.invited) return true;
  if (isPrivileged) return true;
  if (!viewerId) return false;
  return thread.authorId === viewerId || thread.invitees.some((invitee) => invitee.userId === viewerId);
}

export function isThreadVisible(
  thread: { event: EventThreadAccess; knowledgeItem: KnowledgeItemThreadAccess } & OwnThreadAccess,
  viewerId: string | undefined,
  isPrivileged: boolean,
): boolean {
  return (
    isEventThreadVisible(thread.event, viewerId) &&
    isKnowledgeItemThreadVisible(thread.knowledgeItem, viewerId, isPrivileged) &&
    isOwnThreadVisible(thread, viewerId, isPrivileged)
  );
}

const THREAD_LIST_SELECT = {
  id: true,
  title: true,
  pinned: true,
  createdAt: true,
  author: { select: { name: true } },
  posts: { select: { createdAt: true }, orderBy: { createdAt: "desc" } as const, take: 1 },
  _count: { select: { posts: true, views: true } },
  event: EVENT_THREAD_ACCESS_SELECT,
  knowledgeItem: KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
  ...OWN_THREAD_ACCESS_SELECT,
} as const;

function toThreadListItem(thread: {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: Date;
  authorId: string;
  author: { name: string | null };
  posts: { createdAt: Date }[];
  _count: { posts: number; views: number };
  visibility: ForumThreadVisibility;
}): ForumThreadListItem {
  return {
    id: thread.id,
    title: thread.title,
    pinned: thread.pinned,
    authorId: thread.authorId,
    authorName: thread.author.name,
    createdAt: thread.createdAt.toISOString(),
    replyCount: thread._count.posts - 1,
    viewCount: thread._count.views,
    lastActivityAt: (thread.posts[0]?.createdAt ?? thread.createdAt).toISOString(),
    visibility: thread.visibility,
  };
}

/**
 * /forums/[category] (§4.13) — a forum's thread list. `q` absent: plain
 * Postgres query, pinned first then newest first (browse view). `q`
 * present: Meilisearch-backed query scoped to this forum (§7.2/§9), same
 * "real query goes to Meilisearch, browse stays on Postgres" split as
 * getPublishedKnowledgeItems — completes PRD §10's section-scoped search
 * across all three Phase 5 content domains. `userId` is optional so a
 * signed-out visitor can't reach this (page-level redirect handles that)
 * but the function itself doesn't require it. `isPrivileged` (Steward/admin)
 * mirrors the blanket bypass every other Library read path gives them —
 * defaults false for a signed-out visitor.
 */
export async function getForumBySlug(
  slug: string,
  userId?: string,
  isPrivileged = false,
  q?: string,
): Promise<{ forum: ForumCategory; threads: ForumThreadListItem[]; isFollowing: boolean } | null> {
  const forum = await db.forum.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, description: true, active: true, _count: { select: { threads: true } } },
  });
  if (!forum || !forum.active) return null;

  const isFollowing = userId
    ? (await db.forumFollow.findUnique({ where: { forumId_userId: { forumId: forum.id, userId } } })) != null
    : false;

  const forumCategory: ForumCategory = {
    id: forum.id,
    name: forum.name,
    slug: forum.slug,
    description: forum.description,
    threadCount: forum._count.threads,
  };

  if (q?.trim()) {
    const hits = await searchForumDocuments(q.trim(), { forumSlug: slug });
    if (hits.length === 0) return { forum: forumCategory, threads: [], isFollowing };

    const threads = await db.forumThread.findMany({
      where: { id: { in: hits.map((hit) => hit.id) } },
      select: THREAD_LIST_SELECT,
    });
    const visibleThreads = threads.filter((thread) => isThreadVisible(thread, userId, isPrivileged));
    const byId = new Map(visibleThreads.map((thread) => [thread.id, thread]));
    return {
      forum: forumCategory,
      threads: hits.map((hit) => byId.get(hit.id)).filter((thread) => thread != null).map(toThreadListItem),
      isFollowing,
    };
  }

  // Browse view sorts pinned first, then by each thread's latest post
  // (falling back to its own createdAt, same as toThreadListItem) — a
  // thread that just got a new reply surfaces above one that's been
  // dormant since creation, standard forum convention. The /forums/
  // [category] page can re-sort this client-side (newest/most-active)
  // via its sort buttons; this is just the default.
  const threads = await db.forumThread.findMany({
    where: { forumId: forum.id },
    select: THREAD_LIST_SELECT,
  });
  const items = threads
    .filter((thread) => isThreadVisible(thread, userId, isPrivileged))
    .map(toThreadListItem)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });

  return { forum: forumCategory, threads: items, isFollowing };
}

/**
 * /forums/[category]/[threadId] (§4.13) — fetched flat (cheap at this
 * volume) and assembled into a reply tree by `parentPostId`, same pattern
 * as getPostComments. Returns null if the thread doesn't exist, doesn't
 * belong to the forum the URL claims (so /forums/general/[id-from-another-
 * forum] 404s rather than silently rendering under the wrong category), or
 * belongs to a restricted event `viewerId` isn't the host or an invitee of,
 * or a restricted Library item `viewerId` isn't the contributor, an
 * invitee, or Steward/admin of — same 404-not-403 privacy shape, so a
 * guessed URL can't even confirm the thread exists.
 */
export async function getForumThreadDetail(
  forumSlug: string,
  threadId: string,
  viewerId: string | undefined,
  isPrivileged = false,
): Promise<ForumThreadDetail | null> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      title: true,
      pinned: true,
      authorId: true,
      createdAt: true,
      author: { select: { name: true } },
      forum: { select: { id: true, name: true, slug: true } },
      event: EVENT_THREAD_ACCESS_SELECT,
      knowledgeItem: KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
      eventId: true,
      knowledgeItemId: true,
      visibility: true,
      invitees: {
        select: { userId: true, user: { select: { name: true, profile: { select: { avatarUrl: true } } } } },
        orderBy: { createdAt: "asc" },
      },
      posts: {
        select: {
          id: true,
          body: true,
          authorId: true,
          author: { select: { name: true } },
          parentPostId: true,
          createdAt: true,
          editedAt: true,
          flagged: true,
          removed: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { posts: true, views: true } },
    },
  });
  if (!thread || thread.forum.slug !== forumSlug) return null;
  if (!isThreadVisible(thread, viewerId, isPrivileged)) return null;

  const authorProfiles = await getDirectoryMembersByIds(Array.from(new Set(thread.posts.map((post) => post.authorId))));

  const nodes = new Map<string, ForumPostNode>(
    thread.posts.map((post) => [
      post.id,
      {
        id: post.id,
        // A removed post keeps its row (and its replies' threading) but
        // never shows its real body again — same "takedown, not deletion"
        // rule as Post.publishedAt=null for a removed blog post.
        body: post.removed ? "[Removed by a moderator]" : post.body,
        authorId: post.authorId,
        authorName: post.author.name,
        authorProfile: authorProfiles.get(post.authorId) ?? null,
        createdAt: post.createdAt.toISOString(),
        editedAt: post.editedAt?.toISOString() ?? null,
        flagged: post.flagged,
        removed: post.removed,
        replies: [],
      },
    ]),
  );

  const roots: ForumPostNode[] = [];
  for (const post of thread.posts) {
    const node = nodes.get(post.id)!;
    const parent = post.parentPostId ? nodes.get(post.parentPostId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }

  const invitees: ForumThreadRosterMember[] = thread.invitees.map((invitee) => ({
    userId: invitee.userId,
    name: invitee.user.name,
    avatarUrl: getProfileAvatarUrl(invitee.user.profile?.avatarUrl ?? null),
  }));

  return {
    id: thread.id,
    title: thread.title,
    pinned: thread.pinned,
    authorId: thread.authorId,
    authorName: thread.author.name,
    createdAt: thread.createdAt.toISOString(),
    replyCount: thread._count.posts - 1,
    viewCount: thread._count.views,
    forum: thread.forum,
    posts: roots,
    visibility: thread.visibility,
    invitees,
    isEditable: !thread.eventId && !thread.knowledgeItemId,
  };
}

/**
 * /members/[memberId]'s Forums section (§4.5) — the distinct threads this
 * member has posted or replied in, newest activity first. Posts are fetched
 * newest-first and deduped by threadId in JS rather than a SQL DISTINCT ON,
 * so each thread's row naturally keeps that member's most recent post time
 * in it (the first occurrence per threadId in createdAt-desc order). `viewerId`
 * (the profile visitor, distinct from `userId` the profile belongs to) hides
 * any thread tied to a restricted event or Library item neither of them can
 * see (`isPrivileged` reflects the viewer's own Steward/admin status) — a
 * profile page is otherwise a side channel for the same leak
 * getForumThreadDetail blocks directly.
 */
export async function getMemberForumThreads(
  userId: string,
  viewerId: string,
  isPrivileged = false,
): Promise<MemberForumThread[]> {
  const posts = await db.forumPost.findMany({
    where: { authorId: userId },
    select: {
      threadId: true,
      createdAt: true,
      thread: {
        select: {
          title: true,
          forum: { select: { slug: true, name: true } },
          event: EVENT_THREAD_ACCESS_SELECT,
          knowledgeItem: KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
          ...OWN_THREAD_ACCESS_SELECT,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const seenThreadIds = new Set<string>();
  const threads: MemberForumThread[] = [];
  for (const post of posts) {
    if (seenThreadIds.has(post.threadId)) continue;
    seenThreadIds.add(post.threadId);
    if (!isThreadVisible(post.thread, viewerId, isPrivileged)) continue;
    threads.push({
      id: post.threadId,
      title: post.thread.title,
      forumSlug: post.thread.forum.slug,
      forumName: post.thread.forum.name,
      lastPostAt: post.createdAt.toISOString(),
      startedByMember: post.thread.authorId === userId,
    });
  }
  return threads;
}

export async function getThreadViewCount(threadId: string): Promise<number> {
  return db.threadView.count({ where: { threadId } });
}

/**
 * Records a unique visit to a thread for the eye-icon count, called from
 * POST /api/forums/threads/:threadId/view on every page load. Unlike
 * recordPostView, `userId` is always a real signed-in member (both thread
 * pages redirect a signed-out visitor to /sign-in before this can ever
 * fire), so this dedupes on the `[threadId, userId]` unique constraint
 * directly rather than going through an opaque viewer key. Also enforces
 * the same restricted-event/restricted-Library-item visibility as
 * getForumThreadDetail — a direct POST with a guessed threadId shouldn't be
 * able to confirm a restricted thread exists (or inflate its view count)
 * any more than loading the page itself could.
 */
export async function recordThreadView(threadId: string, userId: string, isPrivileged = false): Promise<number> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      event: EVENT_THREAD_ACCESS_SELECT,
      knowledgeItem: KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
      ...OWN_THREAD_ACCESS_SELECT,
    },
  });
  if (!thread || !isThreadVisible(thread, userId, isPrivileged)) throw new ForumError(404, "Thread not found.");

  await db.threadView.createMany({ data: { threadId, userId }, skipDuplicates: true });
  return getThreadViewCount(threadId);
}

/**
 * Bell-notifies invitees that a restricted standalone thread is now
 * reachable to them (Member-Initiated Restricted Forum Threads, §4.13/
 * §11.16) — reused by createForumThread (initial invite list) and
 * updateForumThreadInvitees (a newly-added invitee), same "shared helper,
 * two call sites" precedent as notifyInvitedLibraryUsers in
 * lib/library-server.ts. Unlike the Library/Event equivalents, a forum
 * thread has no draft/pending-review state to gate on — it's visible the
 * instant it's created, so there's no "itemIsVisible" branch to check.
 * Takes a transaction client so callers can post it alongside other writes
 * in the same transaction. No paired email — forums have no existing
 * lifecycle-email precedent to extend.
 */
async function notifyThreadInvitees(
  tx: Prisma.TransactionClient,
  params: { threadId: string; forumSlug: string; title: string; authorName: string; userIds: string[] },
): Promise<void> {
  if (params.userIds.length === 0) return;
  const link = `/forums/${params.forumSlug}/${params.threadId}`;
  const message = `${params.authorName} invited you to a private thread: "${params.title}"`;
  await tx.notification.createMany({
    data: params.userIds.map((userId) => ({
      recipientId: userId,
      type: NotificationType.forum_thread_invited,
      message,
      link,
    })),
  });
}

/**
 * "New Thread" (§4.13) — creates the ForumThread and its opening ForumPost
 * together. The de-identification gate is enforced here rather than in the
 * zod schema, since the schema alone doesn't know which forum a thread is
 * going into — same "type/category decides the gate" shape as
 * createKnowledgeItem's case_study check.
 *
 * Member-Initiated Restricted Forum Threads (§4.13/§11.16): when
 * `visibility` is `invited`, `invitedUserIds` is re-resolved against
 * directory eligibility (ids that aren't eligible, or the author's own id,
 * are silently dropped rather than erroring, same rationale as
 * createEvent/createKnowledgeItem) and must leave at least one real
 * invitee — the zod schema already requires a non-empty list, but a list
 * that resolves to zero eligible members after re-checking still needs to
 * fail here. Every invitee is notified (forum_thread_invited), mirroring
 * event_invited/library_item_shared. `eventId`/`knowledgeItemId` are never
 * set here — only events-server.ts/library-server.ts's own thread-creation
 * paths set those, and neither ever passes a `visibility` — so inherited
 * and member-initiated restriction can never coexist on the same thread.
 */
export async function createForumThread(
  forumId: string,
  authorId: string,
  input: {
    title: string;
    body: string;
    deidentificationConfirmed: boolean;
    visibility: ForumThreadVisibility;
    invitedUserIds: string[];
  },
): Promise<{ id: string }> {
  const forum = await db.forum.findUnique({ where: { id: forumId }, select: { id: true, slug: true, active: true } });
  if (!forum || !forum.active) throw new ForumError(404, "Forum not found.");

  const isClinicalDiscussions = forum.slug === CLINICAL_DISCUSSIONS_SLUG;
  if (isClinicalDiscussions && !input.deidentificationConfirmed) {
    throw new ForumError(400, "You must confirm all patient information has been de-identified.");
  }

  const isRestricted = input.visibility === ForumThreadVisibility.invited;
  const invitees =
    isRestricted && input.invitedUserIds.length > 0
      ? await db.user.findMany({
          where: {
            id: { in: input.invitedUserIds, notIn: [authorId] },
            tier: { in: DIRECTORY_TIERS },
            profile: { listInDirectory: true },
          },
          select: { id: true },
        })
      : [];
  if (isRestricted && invitees.length === 0) {
    throw new ForumError(400, "Select at least one member to invite.");
  }

  const author = isRestricted ? await db.user.findUnique({ where: { id: authorId }, select: { name: true } }) : null;

  const thread = await db.$transaction(async (tx) => {
    const created = await tx.forumThread.create({
      data: {
        forumId,
        authorId,
        title: input.title,
        visibility: isRestricted ? ForumThreadVisibility.invited : ForumThreadVisibility.community,
        posts: {
          create: {
            authorId,
            body: input.body,
            deidentificationConfirmed: isClinicalDiscussions && input.deidentificationConfirmed,
          },
        },
        ...(invitees.length > 0 ? { invitees: { create: invitees.map((user) => ({ userId: user.id })) } } : {}),
      },
      select: { id: true, title: true },
    });

    if (invitees.length > 0) {
      await notifyThreadInvitees(tx, {
        threadId: created.id,
        forumSlug: forum.slug,
        title: created.title,
        authorName: author?.name ?? "A member",
        userIds: invitees.map((user) => user.id),
      });
    }

    return created;
  });

  return { id: thread.id };
}

/**
 * PATCH /api/forums/threads/:threadId — the author or a moderator/admin
 * editing a standalone thread's title and/or audience. Only ever valid for
 * a standalone, member-initiated thread — a thread carrying an
 * eventId/knowledgeItemId has its title fully owned by
 * events-server.ts/library-server.ts (renamed via their own updateMany
 * calls, visibility always `community`, see the ForumThreadVisibility doc
 * comment) and is rejected here with a 400, same rationale as
 * createForumThread never accepting a visibility for those threads.
 *
 * Visibility transitions:
 *   community -> community : no-op on invitees.
 *   invited   -> invited   : `invitedUserIds` is IGNORED — an already-
 *                             restricted thread's roster is only ever
 *                             changed via the existing
 *                             updateForumThreadInvitees/PATCH .../invitees,
 *                             never overwritten here.
 *   community -> invited   : re-resolves invitedUserIds against directory
 *                             eligibility (same rules as createForumThread's
 *                             own resolution block), requires >=1 real
 *                             invitee, creates the ForumThreadInvitee rows
 *                             and notifies them, all inside the same
 *                             transaction as the visibility flip — so there
 *                             is never a persisted state where the thread is
 *                             `invited` with zero invitees.
 *   invited   -> community : rejected (400) — no path back to `community`
 *                             in v1, same rule as the ForumThreadInvitee
 *                             model doc comment and
 *                             updateForumThreadInvitees's own doc comment
 *                             already state.
 */
export async function updateForumThread(
  threadId: string,
  actingUserId: string,
  isPrivileged: boolean,
  input: { title: string; visibility: ForumThreadVisibility; invitedUserIds: string[] },
): Promise<{ id: string }> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      title: true,
      authorId: true,
      visibility: true,
      eventId: true,
      knowledgeItemId: true,
      forum: { select: { slug: true } },
    },
  });
  if (!thread) throw new ForumError(404, "Thread not found.");
  if (thread.eventId || thread.knowledgeItemId) {
    throw new ForumError(400, "This thread's title and audience are managed automatically and can't be edited here.");
  }
  if (!isPrivileged && actingUserId !== thread.authorId) {
    throw new ForumError(403, "Only the thread's author or a moderator/admin can edit it.");
  }
  if (thread.visibility === ForumThreadVisibility.invited && input.visibility === ForumThreadVisibility.community) {
    throw new ForumError(400, "A restricted thread can't be switched back to Everyone.");
  }

  const isNewlyRestricted =
    thread.visibility === ForumThreadVisibility.community && input.visibility === ForumThreadVisibility.invited;

  let invitees: { id: string }[] = [];
  let authorName = "A member";
  if (isNewlyRestricted) {
    invitees =
      input.invitedUserIds.length > 0
        ? await db.user.findMany({
            where: {
              id: { in: input.invitedUserIds, notIn: [thread.authorId] },
              tier: { in: DIRECTORY_TIERS },
              profile: { listInDirectory: true },
            },
            select: { id: true },
          })
        : [];
    if (invitees.length === 0) throw new ForumError(400, "Select at least one member to invite.");
    const author = await db.user.findUnique({ where: { id: thread.authorId }, select: { name: true } });
    authorName = author?.name ?? "A member";
  }

  await db.$transaction(async (tx) => {
    await tx.forumThread.update({
      where: { id: threadId },
      data: {
        title: input.title,
        ...(isNewlyRestricted
          ? { visibility: ForumThreadVisibility.invited, invitees: { create: invitees.map((u) => ({ userId: u.id })) } }
          : {}),
      },
    });

    if (isNewlyRestricted) {
      await notifyThreadInvitees(tx, {
        threadId,
        forumSlug: thread.forum.slug,
        title: input.title,
        authorName,
        userIds: invitees.map((u) => u.id),
      });
    }
  });

  return { id: threadId };
}

/**
 * Posts a reply on a thread and notifies its other participants
 * (`forum_reply_mention`) — every distinct author on the thread plus the
 * thread's own author, plus (for a restricted event's thread) every invitee
 * regardless of whether they've posted yet, so the invited list finds out
 * about updates without having to already be a participant — minus the
 * replier and minus anyone following the forum (followers wait for the
 * future digest instead, §4.10 Phase 6). Same de-identification gate as
 * createForumThread, keyed off the parent thread's forum. Also 404s (rather
 * than 403s) a reply to a restricted event's thread from a non-host,
 * non-invitee, or to a restricted Library item's thread from a non-
 * contributor, non-invitee, non-Steward/admin — same privacy shape as
 * getForumThreadDetail.
 *
 * Also matches `@Full Name` tags (§4.13) against Directory-eligible members
 * and sends each a distinct `mention` notification instead — a tagged
 * participant gets only the mention notification, not both.
 */
export async function createForumPost(
  threadId: string,
  authorId: string,
  input: { body: string; parentId: string | null; deidentificationConfirmed: boolean },
  isPrivileged = false,
): Promise<{ id: string; createdAt: string }> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      title: true,
      forumId: true,
      forum: { select: { slug: true } },
      event: EVENT_THREAD_ACCESS_SELECT,
      knowledgeItem: KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
      ...OWN_THREAD_ACCESS_SELECT,
    },
  });
  if (!thread) throw new ForumError(404, "Thread not found.");
  if (!isThreadVisible(thread, authorId, isPrivileged)) throw new ForumError(404, "Thread not found.");

  if (input.parentId) {
    const parent = await db.forumPost.findUnique({ where: { id: input.parentId }, select: { threadId: true } });
    if (!parent || parent.threadId !== threadId) {
      throw new ForumError(400, "That post no longer exists.");
    }
  }

  const isClinicalDiscussions = thread.forum.slug === CLINICAL_DISCUSSIONS_SLUG;
  if (isClinicalDiscussions && !input.deidentificationConfirmed) {
    throw new ForumError(400, "You must confirm all patient information has been de-identified.");
  }

  const author = await db.user.findUnique({ where: { id: authorId }, select: { name: true } });

  const post = await db.forumPost.create({
    data: {
      threadId,
      authorId,
      body: input.body,
      parentPostId: input.parentId,
      deidentificationConfirmed: isClinicalDiscussions && input.deidentificationConfirmed,
    },
  });
  // Bump the thread's What's New feed position (lib/feed-server.ts's
  // forum_thread branch sorts on this) so fresh replies resurface it
  // instead of it only ever appearing once at its original creation time.
  await db.forumThread.update({ where: { id: threadId }, data: { lastActivityAt: post.createdAt } });

  const participants = await db.forumPost.findMany({
    where: { threadId, authorId: { not: authorId } },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  const otherParticipantIds = new Set(participants.map((participant) => participant.authorId));
  if (thread.authorId !== authorId) otherParticipantIds.add(thread.authorId);
  // A restricted event's invitee should hear about thread activity even
  // before they've posted anything themselves — otherwise the invited list
  // only finds out once someone else happens to reply and tag them.
  if (thread.event?.visibility === EventVisibility.invited) {
    for (const invitee of thread.event.invitees) {
      if (invitee.userId !== authorId) otherParticipantIds.add(invitee.userId);
    }
  }
  // Same rationale for a member-initiated restricted thread's own invitees
  // (§4.13/§11.16) — AC "every invitee gets the normal reply notification
  // for new activity whether or not they've posted."
  if (thread.visibility === ForumThreadVisibility.invited) {
    for (const invitee of thread.invitees) {
      if (invitee.userId !== authorId) otherParticipantIds.add(invitee.userId);
    }
  }

  // A restricted thread's `@`-tag candidates are narrowed to its author and
  // invitees — a mention notification linking to a 404 (or to a resolved
  // "@Name" tag rendered for someone who can never actually open the
  // thread) would otherwise leak the thread's existence to a non-invitee.
  const mentionableMembers = await getMentionableMembers();
  const mentionCandidates =
    thread.visibility === ForumThreadVisibility.invited
      ? mentionableMembers.filter(
          (member) => member.id === thread.authorId || thread.invitees.some((invitee) => invitee.userId === member.id),
        )
      : mentionableMembers;
  const mentionedMembers = findMentionedMembers(input.body, mentionCandidates).filter(
    (member) => member.id !== authorId,
  );
  const postLink = `/forums/${thread.forum.slug}/${threadId}#post-${post.id}`;

  await Promise.all(
    mentionedMembers.map((member) =>
      createNotification({
        recipientId: member.id,
        type: NotificationType.mention,
        message: `${author?.name ?? "A member"} tagged you in "${thread.title}"`,
        link: postLink,
      }),
    ),
  );

  const mentionedIds = new Set(mentionedMembers.map((member) => member.id));

  if (otherParticipantIds.size > 0) {
    const followers = await db.forumFollow.findMany({
      where: { forumId: thread.forumId, userId: { in: Array.from(otherParticipantIds) } },
      select: { userId: true },
    });
    const followerIds = new Set(followers.map((follower) => follower.userId));
    const recipientIds = Array.from(otherParticipantIds).filter(
      (id) => !followerIds.has(id) && !mentionedIds.has(id),
    );

    await Promise.all(
      recipientIds.map((recipientId) =>
        createNotification({
          recipientId,
          type: NotificationType.forum_reply_mention,
          message: `${author?.name ?? "A member"} replied in "${thread.title}"`,
          link: postLink,
        }),
      ),
    );
  }

  return { id: post.id, createdAt: post.createdAt.toISOString() };
}

/**
 * PATCH /api/forums/posts/:postId — the author or a moderator/admin editing
 * an existing post's body, whether it's a thread's opening post or a nested
 * reply (both are ForumPost rows, identical shape). Same
 * isPrivileged-or-isAuthor authorization shape as updateForumThreadInvitees's
 * authorId check below. A removed post (takedown by a moderator) can't be
 * edited — its real body is already hidden from everyone, and editing it
 * could resurrect content a moderator deliberately took down. No separate
 * visibility check is needed here (unlike createForumPost): only the post's
 * own author or a privileged moderator/admin can reach this branch at all,
 * and both already have implicit visibility into the post.
 */
export async function updateForumPost(
  postId: string,
  actingUserId: string,
  isPrivileged: boolean,
  input: { body: string },
): Promise<{ id: string; threadId: string; editedAt: string }> {
  const post = await db.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, threadId: true, removed: true },
  });
  if (!post) throw new ForumError(404, "Post not found.");
  if (post.removed) throw new ForumError(400, "A removed post can't be edited.");
  if (!isPrivileged && actingUserId !== post.authorId) {
    throw new ForumError(403, "Only the post's author or a moderator/admin can edit it.");
  }

  const updated = await db.forumPost.update({
    where: { id: postId },
    data: { body: input.body, editedAt: new Date() },
    select: { id: true, threadId: true, editedAt: true },
  });

  return { id: updated.id, threadId: updated.threadId, editedAt: updated.editedAt!.toISOString() };
}

/**
 * DELETE /api/forums/posts/:postId — the author (or a moderator/admin)
 * removing their own post directly, without going through the
 * flag-then-moderator-resolve queue. Lands in the same state as
 * resolveForumPostFlag's "remove" action (removed: true, row and any
 * threaded replies kept intact, body placeholder'd in getForumThreadDetail)
 * — self-delete and moderator-remove are just two paths to that state, so
 * this also clears a pending flag/flagReason: there's nothing left for a
 * moderator to review once the content is already gone.
 */
export async function deleteForumPost(
  postId: string,
  actingUserId: string,
  isPrivileged: boolean,
): Promise<{ id: string; threadId: string }> {
  const post = await db.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, threadId: true, removed: true },
  });
  if (!post) throw new ForumError(404, "Post not found.");
  if (post.removed) throw new ForumError(400, "This post has already been removed.");
  if (!isPrivileged && actingUserId !== post.authorId) {
    throw new ForumError(403, "Only the post's author or a moderator/admin can delete it.");
  }

  return db.forumPost.update({
    where: { id: postId },
    data: { removed: true, flagged: false, flagReason: null },
    select: { id: true, threadId: true },
  });
}

/**
 * PATCH /api/forums/threads/:threadId/invitees — adds and/or removes
 * members from a restricted standalone thread's invited list after
 * creation (Member-Initiated Restricted Forum Threads, §4.13/§11.16),
 * mirrors updateKnowledgeItemInvitees. Unlike the Library equivalent, a
 * forum thread has no draft/pending-review state, so every notification
 * fires unconditionally rather than being gated on an "itemIsVisible"
 * check. Removing the thread's last invitee is rejected — a restricted
 * thread always keeps at least one, and there's no path to flip `invited`
 * back to `community` in v1.
 */
export async function updateForumThreadInvitees(
  threadId: string,
  userId: string,
  isPrivileged: boolean,
  input: { addUserIds: string[]; removeUserIds: string[] },
): Promise<{ added: number; removed: number }> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      title: true,
      authorId: true,
      visibility: true,
      forum: { select: { slug: true } },
      _count: { select: { invitees: true } },
    },
  });
  if (!thread) throw new ForumError(404, "Thread not found.");
  if (thread.visibility !== ForumThreadVisibility.invited) {
    throw new ForumError(400, "Only a restricted thread has an invited list.");
  }
  if (!isPrivileged && userId !== thread.authorId) {
    throw new ForumError(403, "Only the thread's author or a moderator/admin can manage invitees.");
  }

  const author = await db.user.findUnique({ where: { id: thread.authorId }, select: { name: true } });
  const authorName = author?.name ?? "A member";

  // Re-resolved against directory eligibility, same rationale as
  // createForumThread — ids that aren't eligible (or already invited, or
  // the author) are silently dropped rather than erroring.
  const [addCandidates, alreadyInvited, removeCandidates] = await Promise.all([
    input.addUserIds.length > 0
      ? db.user.findMany({
          where: {
            id: { in: input.addUserIds, notIn: [thread.authorId] },
            tier: { in: DIRECTORY_TIERS },
            profile: { listInDirectory: true },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    input.addUserIds.length > 0
      ? db.forumThreadInvitee.findMany({
          where: { threadId, userId: { in: input.addUserIds } },
          select: { userId: true },
        })
      : Promise.resolve([]),
    input.removeUserIds.length > 0
      ? db.forumThreadInvitee.findMany({
          where: { threadId, userId: { in: input.removeUserIds } },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);
  const alreadyInvitedIds = new Set(alreadyInvited.map((row) => row.userId));
  const newInvitees = addCandidates.filter((user) => !alreadyInvitedIds.has(user.id));

  const finalCount = thread._count.invitees + newInvitees.length - removeCandidates.length;
  if (removeCandidates.length > 0 && finalCount < 1) {
    throw new ForumError(400, "A restricted thread must keep at least one invited member.");
  }

  await db.$transaction(async (tx) => {
    if (newInvitees.length > 0) {
      await tx.forumThreadInvitee.createMany({
        data: newInvitees.map((user) => ({ threadId, userId: user.id })),
      });
      await notifyThreadInvitees(tx, {
        threadId,
        forumSlug: thread.forum.slug,
        title: thread.title,
        authorName,
        userIds: newInvitees.map((user) => user.id),
      });
    }

    if (removeCandidates.length > 0) {
      const removeIds = removeCandidates.map((row) => row.userId);
      await tx.forumThreadInvitee.deleteMany({ where: { threadId, userId: { in: removeIds } } });
      await tx.notification.createMany({
        data: removeIds.map((recipientId) => ({
          recipientId,
          type: NotificationType.forum_thread_removed,
          message: `You no longer have access to a private thread: "${thread.title}"`,
          // No link — a removed invitee's next request for the thread
          // 404s, same rationale as library_item_removed/event_removed.
          link: null,
        })),
      });
    }
  });

  return { added: newInvitees.length, removed: removeCandidates.length };
}

/**
 * POST /api/forums/:forumId/follow (§4.13) — toggles a member's follow on
 * a forum; the caller (route handler) reports the new state back to the
 * client. Following doesn't currently do anything beyond suppressing
 * per-post notifications (see createForumPost) — digest delivery is a
 * later Phase 6 objective.
 */
export async function toggleForumFollow(forumId: string, userId: string): Promise<{ following: boolean }> {
  const forum = await db.forum.findUnique({ where: { id: forumId }, select: { id: true } });
  if (!forum) throw new ForumError(404, "Forum not found.");

  const existing = await db.forumFollow.findUnique({ where: { forumId_userId: { forumId, userId } } });
  if (existing) {
    await db.forumFollow.delete({ where: { id: existing.id } });
    return { following: false };
  }

  await db.forumFollow.create({ data: { forumId, userId } });
  return { following: true };
}

/**
 * POST /api/forums/posts/:postId/flag (§4.13) — community flagging, same
 * "routes to the shared moderation model, stays visible" rule as
 * flagKnowledgeItem, but a plain boolean here (not a status enum) since a
 * forum post has no publish workflow to also encode. A post already
 * flagged can't be flagged again.
 */
export async function flagForumPost(id: string, reason: string): Promise<{ id: string; flagged: boolean }> {
  const post = await db.forumPost.findUnique({ where: { id }, select: { id: true, flagged: true } });
  if (!post) throw new ForumError(404, "Post not found.");
  if (post.flagged) throw new ForumError(400, "This post has already been flagged.");

  return db.forumPost.update({
    where: { id },
    data: { flagged: true, flagReason: reason },
    select: { id: true, flagged: true },
  });
}

/**
 * PATCH /api/admin/content (§4.11) — a moderator/admin resolving a flagged
 * post from the shared moderation queue: "dismiss" clears the flag (post
 * stays visible, unchanged), "remove" takes it down (body replaced with a
 * placeholder in getForumThreadDetail) without deleting the row, so any
 * replies threaded under it keep their parentPostId intact.
 */
export async function resolveForumPostFlag(
  id: string,
  action: "dismiss" | "remove",
  adminId: string,
): Promise<{ id: string; flagged: boolean; removed: boolean; threadId: string }> {
  const post = await db.forumPost.findUnique({ where: { id }, select: { id: true, flagged: true } });
  if (!post) throw new ForumError(404, "Post not found.");
  if (!post.flagged) throw new ForumError(400, "This post is not currently flagged.");

  return db.$transaction(async (tx) => {
    const updated = await tx.forumPost.update({
      where: { id },
      data:
        action === "remove"
          ? { flagged: false, flagReason: null, removed: true }
          : { flagged: false, flagReason: null },
      select: { id: true, flagged: true, removed: true, threadId: true },
    });
    await recordAdminAction(
      {
        actorId: adminId,
        action: action === "remove" ? "content.removed" : "content.dismissed",
        entityType: "ForumPost",
        entityId: id,
      },
      tx,
    );
    return updated;
  });
}

const TRENDING_WINDOW_DAYS = 30;

/**
 * Dashboard "What's Trending" — forum threads with the most replies posted
 * in the last 30 days. Mirrors isThreadVisible's three gates (own-thread
 * `invited` visibility, event-inherited restriction, knowledge-item-
 * inherited restriction) as a per-viewer Prisma filter: each gate passes if
 * it isn't restricted, or the viewer is the author/host/contributor/an
 * invitee. isPrivileged (admin/moderator) bypasses every gate, including the
 * event-inherited one, which isThreadVisible itself doesn't bypass — for
 * this dashboard-wide surface an admin should always see what's trending.
 */
export async function getTrendingForumThreads(
  userId: string,
  isPrivileged: boolean,
  limit = 3,
): Promise<{ id: string; title: string; forumSlug: string; replyCount: number }[]> {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const grouped = await db.forumPost.groupBy({
    by: ["threadId"],
    where: { createdAt: { gte: since } },
    _count: { threadId: true },
    orderBy: { _count: { threadId: "desc" } },
    take: limit * 3,
  });
  if (grouped.length === 0) return [];

  const threads = await db.forumThread.findMany({
    where: {
      id: { in: grouped.map((group) => group.threadId) },
      ...(isPrivileged
        ? {}
        : {
            AND: [
              {
                OR: [
                  { visibility: ForumThreadVisibility.community },
                  { authorId: userId },
                  { invitees: { some: { userId } } },
                ],
              },
              {
                OR: [
                  { eventId: null },
                  { event: { visibility: { not: EventVisibility.invited } } },
                  { event: { hostId: userId } },
                  { event: { invitees: { some: { userId } } } },
                ],
              },
              {
                OR: [
                  { knowledgeItemId: null },
                  { knowledgeItem: { visibility: { not: KnowledgeVisibility.restricted } } },
                  { knowledgeItem: { contributorId: userId } },
                  { knowledgeItem: { invitees: { some: { userId } } } },
                ],
              },
            ],
          }),
    },
    select: { id: true, title: true, forum: { select: { slug: true } } },
  });
  const byId = new Map(threads.map((thread) => [thread.id, thread]));

  return grouped
    .flatMap((group) => {
      const thread = byId.get(group.threadId);
      return thread
        ? [{ id: thread.id, title: thread.title, forumSlug: thread.forum.slug, replyCount: group._count.threadId }]
        : [];
    })
    .slice(0, limit);
}
