// No "server-only" guard: imported directly by scripts/worker.ts and
// scripts/reindex-profiles.ts, which run outside Next's server runtime.
import { db } from "@/lib/db";
import {
  deleteProfileDocument,
  deletePostDocument,
  deleteLibraryDocument,
  deleteForumDocument,
  upsertPostDocument,
  upsertProfileDocument,
  upsertLibraryDocument,
  upsertForumDocument,
} from "@/lib/meilisearch";
import { DIRECTORY_TIERS } from "@/lib/members";
import { excerptFromHtml } from "@/lib/blog";
import { KnowledgeStatus } from "@/lib/generated/prisma/enums";

/**
 * Re-derives directory eligibility from the DB rather than trusting the
 * caller, so this stays correct regardless of which write path triggered it
 * (profile edit, avatar change, preference toggle, §4.3/§7.2). Ineligible
 * profiles (not listed, or a tier the Directory excludes — Friend, §4.5) are
 * removed from the index rather than left stale.
 */
export async function syncProfileToIndex(userId: string): Promise<void> {
  const profile = await db.profile.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, tier: true } },
      skills: { select: { skill: { select: { name: true } } } },
    },
  });

  const eligible =
    profile?.listInDirectory && profile.user.tier !== null && DIRECTORY_TIERS.includes(profile.user.tier);

  if (!eligible) {
    await deleteProfileDocument(userId);
    return;
  }

  await upsertProfileDocument({
    id: profile.userId,
    name: profile.user.name,
    tier: profile.user.tier,
    expertiseAreas: profile.expertiseAreas,
    skillNames: profile.skills.map(({ skill }) => skill.name),
    titleSpecialty: profile.showSpecialtyLocation ? profile.titleSpecialty : null,
    countryRegion: profile.showSpecialtyLocation ? profile.countryRegion : null,
  });
}

/**
 * Re-derives publish state from the DB rather than trusting the caller,
 * same rationale as syncProfileToIndex — a post that's since been
 * unpublished (a future editing objective) is removed from the index
 * rather than left stale (§4.8/§7.2).
 */
export async function syncPostToIndex(postId: string): Promise<void> {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      author: { select: { name: true } },
      category: { select: { name: true, slug: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  if (!post || !post.publishedAt) {
    await deletePostDocument(postId);
    return;
  }

  await upsertPostDocument({
    id: post.id,
    title: post.title,
    excerpt: excerptFromHtml(post.body),
    authorName: post.author.name,
    categoryName: post.category.name,
    categorySlug: post.category.slug,
    tagNames: post.tags.map(({ tag }) => tag.name),
  });
}

/**
 * Re-derives search eligibility from the DB rather than trusting the
 * caller, same "re-derive, don't trust" rule as syncProfileToIndex/
 * syncPostToIndex. `published` and `flagged` are both eligible — flagged
 * items "stay visible" per the community-flagging model (§4.9), including
 * in search; `pending_review`/`rejected` are removed.
 */
export async function syncKnowledgeItemToIndex(knowledgeItemId: string): Promise<void> {
  const item = await db.knowledgeItem.findUnique({
    where: { id: knowledgeItemId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      contentType: true,
      level: true,
      contributor: { select: { name: true } },
      category: { select: { name: true, slug: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  const eligible = item && (item.status === KnowledgeStatus.published || item.status === KnowledgeStatus.flagged);
  if (!eligible) {
    await deleteLibraryDocument(knowledgeItemId);
    return;
  }

  await upsertLibraryDocument({
    id: item.id,
    title: item.title,
    description: item.description,
    contributorName: item.contributor.name,
    categoryName: item.category.name,
    categorySlug: item.category.slug,
    contentType: item.contentType,
    level: item.level,
    tagNames: item.tags.map(({ tag }) => tag.name),
  });
}

/**
 * Re-derives the thread's full text from the DB rather than trusting the
 * caller — called from both createForumThread and createForumPost so a new
 * reply's text is reflected the next time the thread is re-synced, same
 * "re-derive, don't trust" rule as syncPostToIndex/syncKnowledgeItemToIndex.
 * All forum content is visible to the full membership as soon as it's
 * posted (no publish/review gate), so the only "not eligible" case is the
 * thread no longer existing.
 */
export async function syncForumThreadToIndex(threadId: string): Promise<void> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      title: true,
      author: { select: { name: true } },
      forum: { select: { name: true, slug: true } },
      posts: { select: { body: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!thread) {
    await deleteForumDocument(threadId);
    return;
  }

  await upsertForumDocument({
    id: thread.id,
    title: thread.title,
    body: thread.posts.map((post) => post.body).join("\n\n"),
    authorName: thread.author.name,
    forumName: thread.forum.name,
    forumSlug: thread.forum.slug,
  });
}
