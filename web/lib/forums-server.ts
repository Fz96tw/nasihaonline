import "server-only";
import { db } from "@/lib/db";
import { NotificationType } from "@/lib/generated/prisma/enums";
import { createNotification } from "@/lib/notifications-server";
import { searchForumDocuments } from "@/lib/meilisearch";
import { CLINICAL_DISCUSSIONS_SLUG } from "@/lib/forums";
import type { ForumCategory, ForumThreadListItem, ForumThreadDetail, ForumPostNode } from "@/lib/forums";

export class ForumError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

/** /forums (§4.13) — the six seeded forum categories, admin-manageable but not editable here yet. */
export async function getForumCategories(): Promise<ForumCategory[]> {
  const forums = await db.forum.findMany({
    where: { active: true },
    select: { id: true, name: true, slug: true, description: true, _count: { select: { threads: true } } },
    orderBy: { displayOrder: "asc" },
  });

  return forums.map((forum) => ({
    id: forum.id,
    name: forum.name,
    slug: forum.slug,
    description: forum.description,
    threadCount: forum._count.threads,
  }));
}

const THREAD_LIST_SELECT = {
  id: true,
  title: true,
  pinned: true,
  createdAt: true,
  author: { select: { name: true } },
  posts: { select: { createdAt: true }, orderBy: { createdAt: "desc" } as const, take: 1 },
  _count: { select: { posts: true } },
} as const;

function toThreadListItem(thread: {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: Date;
  author: { name: string | null };
  posts: { createdAt: Date }[];
  _count: { posts: number };
}): ForumThreadListItem {
  return {
    id: thread.id,
    title: thread.title,
    pinned: thread.pinned,
    authorName: thread.author.name,
    createdAt: thread.createdAt.toISOString(),
    replyCount: thread._count.posts - 1,
    lastActivityAt: (thread.posts[0]?.createdAt ?? thread.createdAt).toISOString(),
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
 * but the function itself doesn't require it.
 */
export async function getForumBySlug(
  slug: string,
  userId?: string,
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
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    return {
      forum: forumCategory,
      threads: hits.map((hit) => byId.get(hit.id)).filter((thread) => thread != null).map(toThreadListItem),
      isFollowing,
    };
  }

  const threads = await db.forumThread.findMany({
    where: { forumId: forum.id },
    select: THREAD_LIST_SELECT,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });

  return { forum: forumCategory, threads: threads.map(toThreadListItem), isFollowing };
}

/**
 * /forums/[category]/[threadId] (§4.13) — fetched flat (cheap at this
 * volume) and assembled into a reply tree by `parentPostId`, same pattern
 * as getPostComments. Returns null if the thread doesn't exist or doesn't
 * belong to the forum the URL claims (so /forums/general/[id-from-another-
 * forum] 404s rather than silently rendering under the wrong category).
 */
export async function getForumThreadDetail(forumSlug: string, threadId: string): Promise<ForumThreadDetail | null> {
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
      posts: {
        select: {
          id: true,
          body: true,
          authorId: true,
          author: { select: { name: true } },
          parentPostId: true,
          createdAt: true,
          flagged: true,
          removed: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!thread || thread.forum.slug !== forumSlug) return null;

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
        createdAt: post.createdAt.toISOString(),
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

  return {
    id: thread.id,
    title: thread.title,
    pinned: thread.pinned,
    authorId: thread.authorId,
    authorName: thread.author.name,
    createdAt: thread.createdAt.toISOString(),
    forum: thread.forum,
    posts: roots,
  };
}

/**
 * "New Thread" (§4.13) — creates the ForumThread and its opening ForumPost
 * together. No notification here (no other participants exist yet, unlike
 * createForumPost). The de-identification gate is enforced here rather than
 * in the zod schema, since the schema alone doesn't know which forum a
 * thread is going into — same "type/category decides the gate" shape as
 * createKnowledgeItem's case_study check.
 */
export async function createForumThread(
  forumId: string,
  authorId: string,
  input: { title: string; body: string; deidentificationConfirmed: boolean },
): Promise<{ id: string }> {
  const forum = await db.forum.findUnique({ where: { id: forumId }, select: { id: true, slug: true, active: true } });
  if (!forum || !forum.active) throw new ForumError(404, "Forum not found.");

  const isClinicalDiscussions = forum.slug === CLINICAL_DISCUSSIONS_SLUG;
  if (isClinicalDiscussions && !input.deidentificationConfirmed) {
    throw new ForumError(400, "You must confirm all patient information has been de-identified.");
  }

  const thread = await db.forumThread.create({
    data: {
      forumId,
      authorId,
      title: input.title,
      posts: {
        create: {
          authorId,
          body: input.body,
          deidentificationConfirmed: isClinicalDiscussions && input.deidentificationConfirmed,
        },
      },
    },
    select: { id: true },
  });

  return thread;
}

/**
 * Posts a reply on a thread and notifies its other participants
 * (`forum_reply_mention`) — every distinct author on the thread plus the
 * thread's own author, minus the replier and minus anyone following the
 * forum (followers wait for the future digest instead, §4.10 Phase 6).
 * Same de-identification gate as createForumThread, keyed off the parent
 * thread's forum.
 */
export async function createForumPost(
  threadId: string,
  authorId: string,
  input: { body: string; parentId: string | null; deidentificationConfirmed: boolean },
): Promise<{ id: string; createdAt: string }> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true, title: true, forumId: true, authorId: true, forum: { select: { slug: true } } },
  });
  if (!thread) throw new ForumError(404, "Thread not found.");

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

  const participants = await db.forumPost.findMany({
    where: { threadId, authorId: { not: authorId } },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  const otherParticipantIds = new Set(participants.map((participant) => participant.authorId));
  if (thread.authorId !== authorId) otherParticipantIds.add(thread.authorId);

  if (otherParticipantIds.size > 0) {
    const followers = await db.forumFollow.findMany({
      where: { forumId: thread.forumId, userId: { in: Array.from(otherParticipantIds) } },
      select: { userId: true },
    });
    const followerIds = new Set(followers.map((follower) => follower.userId));
    const recipientIds = Array.from(otherParticipantIds).filter((id) => !followerIds.has(id));

    await Promise.all(
      recipientIds.map((recipientId) =>
        createNotification({
          recipientId,
          type: NotificationType.forum_reply_mention,
          message: `${author?.name ?? "A member"} replied in "${thread.title}"`,
          link: `/forums/${thread.forum.slug}/${threadId}#post-${post.id}`,
        }),
      ),
    );
  }

  return { id: post.id, createdAt: post.createdAt.toISOString() };
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
export async function flagForumPost(id: string): Promise<{ id: string; flagged: boolean }> {
  const post = await db.forumPost.findUnique({ where: { id }, select: { id: true, flagged: true } });
  if (!post) throw new ForumError(404, "Post not found.");
  if (post.flagged) throw new ForumError(400, "This post has already been flagged.");

  return db.forumPost.update({ where: { id }, data: { flagged: true }, select: { id: true, flagged: true } });
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
): Promise<{ id: string; flagged: boolean; removed: boolean; threadId: string }> {
  const post = await db.forumPost.findUnique({ where: { id }, select: { id: true, flagged: true } });
  if (!post) throw new ForumError(404, "Post not found.");
  if (!post.flagged) throw new ForumError(400, "This post is not currently flagged.");

  return db.forumPost.update({
    where: { id },
    data: action === "remove" ? { flagged: false, removed: true } : { flagged: false },
    select: { id: true, flagged: true, removed: true, threadId: true },
  });
}
