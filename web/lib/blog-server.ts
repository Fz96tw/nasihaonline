import "server-only";
import { db } from "@/lib/db";
import {
  getProfileAvatarUrl,
  getPostHeroImageUrl,
  uploadPostHeroImage,
  deletePostHeroImage,
  UploadValidationError,
} from "@/lib/storage";
import { searchPostDocuments } from "@/lib/meilisearch";
import {
  ContributionSource,
  LedgerStatus,
  LedgerTransactionType,
  NotificationType,
  Role,
} from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { createNotification } from "@/lib/notifications-server";
import { getMentionableMembers } from "@/lib/members-server";
import { findMentionedMembers } from "@/lib/mentions";
import type { PostCard, PostDetail, PostCategoryOption, PostTagOption, PostCommentNode } from "@/lib/blog";
import { excerptFromHtml } from "@/lib/blog";

const CARD_SELECT = {
  id: true,
  title: true,
  slug: true,
  body: true,
  heroImageUrl: true,
  publishedAt: true,
  author: { select: { name: true, profile: { select: { avatarUrl: true } } } },
  category: { select: { name: true, slug: true } },
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "post";
  let candidate = base;
  let suffix = 2;
  while (await db.post.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function toCard(post: {
  id: string;
  title: string;
  slug: string;
  body: string;
  heroImageUrl: string | null;
  publishedAt: Date | null;
  author: { name: string | null; profile: { avatarUrl: string | null } | null };
  category: { name: string; slug: string };
}): PostCard {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: excerptFromHtml(post.body),
    heroImageUrl: getPostHeroImageUrl(post.heroImageUrl),
    // Callers only ever pass published rows in (see getPublishedPosts/getPostBySlug's
    // where clauses) so publishedAt is never actually null here.
    publishedAt: (post.publishedAt ?? new Date()).toISOString(),
    author: { name: post.author.name, avatarUrl: getProfileAvatarUrl(post.author.profile?.avatarUrl ?? null) },
    category: post.category,
  };
}

/**
 * /blog listing (§4.8) — plain Postgres query filtered/sorted by
 * publishedAt for a browse view (`q` absent), or a Meilisearch-backed query
 * for `q` present (§7.2/§9), same "real query goes to Meilisearch, browse
 * stays on Postgres" split as getDirectoryMembers/searchDirectoryMembers.
 */
export async function getPublishedPosts(params: { categorySlug?: string; q?: string }): Promise<PostCard[]> {
  const categoryFilter = params.categorySlug ? { category: { slug: params.categorySlug } } : {};

  if (params.q?.trim()) {
    const hits = await searchPostDocuments(params.q.trim(), { categorySlug: params.categorySlug });
    if (hits.length === 0) return [];

    const posts = await db.post.findMany({
      where: { id: { in: hits.map((hit) => hit.id) }, publishedAt: { not: null } },
      select: CARD_SELECT,
    });
    const byId = new Map(posts.map((post) => [post.id, post]));
    return hits.map((hit) => byId.get(hit.id)).filter((post) => post != null).map(toCard);
  }

  const posts = await db.post.findMany({
    where: { publishedAt: { not: null }, ...categoryFilter },
    select: CARD_SELECT,
    orderBy: { publishedAt: "desc" },
  });
  return posts.map(toCard);
}

/** Dashboard's recently-added-blog widget (§5/§10 Phase 5) — newest published posts, plain Postgres query. */
export async function getRecentlyPublishedPosts(limit = 5): Promise<PostCard[]> {
  const posts = await db.post.findMany({
    where: { publishedAt: { not: null } },
    select: CARD_SELECT,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return posts.map(toCard);
}

/** "More from this author" on the post detail page — plain Postgres query, same shape as getRecentlyPublishedPosts. */
export async function getPostsByAuthor(authorId: string, excludePostId: string, limit = 3): Promise<PostCard[]> {
  const posts = await db.post.findMany({
    where: { publishedAt: { not: null }, authorId, id: { not: excludePostId } },
    select: CARD_SELECT,
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return posts.map(toCard);
}

export async function getPublishedPostBySlug(slug: string): Promise<PostDetail | null> {
  const post = await db.post.findFirst({
    where: { slug, publishedAt: { not: null } },
    select: {
      ...CARD_SELECT,
      authorId: true,
      categoryId: true,
      flagged: true,
      tags: { select: { tagId: true, tag: { select: { name: true, slug: true } } } },
    },
  });
  if (!post) return null;

  return {
    ...toCard(post),
    body: post.body,
    authorId: post.authorId,
    categoryId: post.categoryId,
    tagIds: post.tags.map(({ tagId }) => tagId),
    tags: post.tags.map(({ tag }) => tag),
    flagged: post.flagged,
  };
}

export async function getPostCategories(): Promise<PostCategoryOption[]> {
  return db.postCategory.findMany({ orderBy: { name: "asc" } });
}

export async function getPostTags(): Promise<PostTagOption[]> {
  return db.postTag.findMany({ orderBy: { name: "asc" } });
}

export class PostError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

const WRITE_POST_ACTIVITY_KEY = "write_post";

/**
 * "Write a Post" (§4.8) — a single-step create-and-publish action gated on
 * the licensing-consent checkbox (§4.15): there is no separate draft/publish
 * flow in this objective's UI, so licenseConsented=true always means
 * publishedAt is set in the same write. The `Post.publishedAt: null` "draft"
 * state the data model supports (§5.1) is left for a future editing
 * objective to expose.
 */
export async function createPost(
  authorId: string,
  input: {
    title: string;
    body: string;
    categoryId: string;
    tagIds: string[];
    licenseConsented: boolean;
    heroImage: File | null;
  },
): Promise<{ id: string; slug: string }> {
  if (!input.licenseConsented) {
    throw new PostError(400, "You must acknowledge the content licensing terms to publish.");
  }

  const category = await db.postCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
  if (!category) {
    throw new PostError(400, "Select a valid category.");
  }

  let heroImageUrl: string | null = null;
  if (input.heroImage) {
    try {
      heroImageUrl = await uploadPostHeroImage(input.heroImage);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new PostError(400, error.message);
      }
      throw error;
    }
  }

  const slug = await uniqueSlug(input.title);
  const writePostRule = await db.contributionRule.findUnique({ where: { activityKey: WRITE_POST_ACTIVITY_KEY } });

  const post = await db.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        title: input.title,
        slug,
        body: input.body,
        authorId,
        categoryId: input.categoryId,
        heroImageUrl,
        licenseConsented: true,
        publishedAt: new Date(),
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
      select: { id: true, slug: true, title: true },
    });

    // Auto-credit Knowledge Hours (§4.4/§4.8) — best-effort: publishing must
    // still succeed if the rule is missing/inactive, since blog authorship
    // has no natural counterpart to name and therefore always lands in the
    // admin's counterpart-less confirmation queue (resolveContribution).
    if (writePostRule && writePostRule.active && writePostRule.type === LedgerTransactionType.earned) {
      const event = await tx.contributionEvent.create({
        data: {
          ruleId: writePostRule.id,
          actorId: authorId,
          note: `Blog post: ${created.title}`,
          source: ContributionSource.blog_post,
        },
      });

      await tx.contributionLedger.create({
        data: {
          userId: authorId,
          eventId: event.id,
          type: LedgerTransactionType.earned,
          status: LedgerStatus.pending,
          hours: writePostRule.hours,
        },
      });
    }

    return created;
  });

  return { id: post.id, slug: post.slug };
}

/**
 * PATCH /api/blog/:slug (§4.8, §11.12) — the author or an admin revising a
 * published post's title/body/category/tags/hero image. Slug and
 * publishedAt are deliberately left untouched (only `updatedAt` moves),
 * same "admin has the author's authority" precedent as resolvePostFlag's
 * takedown path, and the same isAdmin/isAuthor authorization shape as
 * recordHostAttendance's host-or-admin check.
 */
export async function updatePost(
  slug: string,
  actingUser: UserModel,
  input: {
    title: string;
    body: string;
    categoryId: string;
    tagIds: string[];
    heroImage: File | null;
  },
): Promise<{ id: string; slug: string }> {
  const post = await db.post.findUnique({
    where: { slug },
    select: { id: true, authorId: true, heroImageUrl: true, publishedAt: true },
  });
  if (!post || !post.publishedAt) throw new PostError(404, "Post not found.");

  const isAdmin = actingUser.role === Role.admin;
  const isAuthor = post.authorId === actingUser.id;
  if (!isAdmin && !isAuthor) {
    throw new PostError(403, "Only the post's author or an admin can edit it.");
  }

  const category = await db.postCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
  if (!category) {
    throw new PostError(400, "Select a valid category.");
  }

  let heroImageUrl = post.heroImageUrl;
  if (input.heroImage) {
    try {
      heroImageUrl = await uploadPostHeroImage(input.heroImage);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new PostError(400, error.message);
      }
      throw error;
    }
  }

  const updated = await db.$transaction(async (tx) => {
    await tx.postTagOnPost.deleteMany({ where: { postId: post.id } });
    return tx.post.update({
      where: { id: post.id },
      data: {
        title: input.title,
        body: input.body,
        categoryId: input.categoryId,
        heroImageUrl,
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
      select: { id: true, slug: true },
    });
  });

  if (input.heroImage && post.heroImageUrl) {
    await deletePostHeroImage(post.heroImageUrl);
  }

  return updated;
}

/**
 * Threaded comments on a Post (§4.8) — fetched flat (cheap for a single
 * post's volume) and assembled into a reply tree by `parentId`, unlike
 * InboxMessage's root-flattened threads: comments are multi-author, so
 * "who's the other party" doesn't apply and a real nested tree is the
 * natural shape.
 */
export async function getPostComments(postId: string): Promise<PostCommentNode[]> {
  const comments = await db.postComment.findMany({
    where: { postId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const nodes = new Map<string, PostCommentNode>(
    comments.map((comment) => [
      comment.id,
      {
        id: comment.id,
        body: comment.body,
        authorId: comment.authorId,
        authorName: comment.author.name,
        createdAt: comment.createdAt.toISOString(),
        replies: [],
      },
    ]),
  );

  const roots: PostCommentNode[] = [];
  for (const comment of comments) {
    const node = nodes.get(comment.id)!;
    const parent = comment.parentId ? nodes.get(comment.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }

  return roots;
}

export async function getPostViewCount(postId: string): Promise<number> {
  return db.postView.count({ where: { postId } });
}

/**
 * Records a unique visit to a published post for the eye-icon count. Called
 * from POST /api/blog/:slug/view on every page load, but `viewerKey` (see
 * schema comment on PostView) is unique per post, so repeat visits from the
 * same signed-in user or anon cookie no-op via `skipDuplicates` rather than
 * inflating the count. Returns the up-to-date total.
 */
export async function recordPostView(postId: string, viewerKey: string): Promise<number> {
  await db.postView.createMany({ data: { postId, viewerKey }, skipDuplicates: true });
  return getPostViewCount(postId);
}

export class PostCommentError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Posts a comment (or threaded reply) on a published post and notifies the
 * post's author (§4.10's blog_comment type), unless the commenter is the
 * author — same "don't notify yourself" rule as sendMessage's self-message
 * guard.
 *
 * Also matches `@Full Name` tags (§4.8) against Directory-eligible members
 * and sends each a distinct `mention` notification instead — the post
 * author gets only the mention notification if they're also tagged, not
 * both.
 */
export async function createPostComment(
  postId: string,
  authorId: string,
  input: { body: string; parentId: string | null },
): Promise<{ id: string; createdAt: string }> {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { slug: true, title: true, authorId: true },
  });
  if (!post) throw new PostCommentError(404, "Post not found.");

  if (input.parentId) {
    const parent = await db.postComment.findUnique({ where: { id: input.parentId }, select: { postId: true } });
    if (!parent || parent.postId !== postId) {
      throw new PostCommentError(400, "That comment no longer exists.");
    }
  }

  const commenter = await db.user.findUnique({ where: { id: authorId }, select: { name: true } });

  const comment = await db.postComment.create({
    data: { postId, authorId, body: input.body, parentId: input.parentId },
  });

  const commentLink = `/blog/${post.slug}#comment-${comment.id}`;

  const mentionableMembers = await getMentionableMembers();
  const mentionedMembers = findMentionedMembers(input.body, mentionableMembers).filter(
    (member) => member.id !== authorId,
  );

  await Promise.all(
    mentionedMembers.map((member) =>
      createNotification({
        recipientId: member.id,
        type: NotificationType.mention,
        message: `${commenter?.name ?? "A member"} tagged you in a comment on "${post.title}"`,
        link: commentLink,
      }),
    ),
  );

  const mentionedIds = new Set(mentionedMembers.map((member) => member.id));

  if (authorId !== post.authorId && !mentionedIds.has(post.authorId)) {
    await createNotification({
      recipientId: post.authorId,
      type: NotificationType.blog_comment,
      message: `${commenter?.name ?? "A member"} commented on your post "${post.title}"`,
      link: commentLink,
    });
  }

  return { id: comment.id, createdAt: comment.createdAt.toISOString() };
}

/**
 * POST /api/blog/:slug/flag (§4.8) — community flagging, same "routes into
 * the shared moderation model, stays visible" rule as flagKnowledgeItem/
 * flagForumPost. Only a currently published post can be flagged, and not a
 * second time while already flagged.
 */
export async function flagPost(id: string, reason: string): Promise<{ id: string; flagged: boolean }> {
  const post = await db.post.findUnique({ where: { id }, select: { id: true, flagged: true, publishedAt: true } });
  if (!post || !post.publishedAt) throw new PostError(404, "Post not found.");
  if (post.flagged) throw new PostError(400, "This post has already been flagged.");

  return db.post.update({
    where: { id },
    data: { flagged: true, flagReason: reason },
    select: { id: true, flagged: true },
  });
}

/**
 * PATCH /api/admin/content (§4.11) — a moderator/admin resolving a flagged
 * post from the shared moderation queue: "dismiss" clears the flag (post
 * stays published, unchanged), "remove" unpublishes it (publishedAt: null),
 * the same "takedown, not deletion" convention as ForumPost.removed —
 * getPublishedPosts/getPublishedPostBySlug already exclude unpublished rows.
 */
export async function resolvePostFlag(
  id: string,
  action: "dismiss" | "remove",
): Promise<{ id: string; flagged: boolean; publishedAt: Date | null }> {
  const post = await db.post.findUnique({ where: { id }, select: { id: true, flagged: true } });
  if (!post) throw new PostError(404, "Post not found.");
  if (!post.flagged) throw new PostError(400, "This post is not currently flagged.");

  return db.post.update({
    where: { id },
    data:
      action === "remove"
        ? { flagged: false, flagReason: null, publishedAt: null }
        : { flagged: false, flagReason: null },
    select: { id: true, flagged: true, publishedAt: true },
  });
}
