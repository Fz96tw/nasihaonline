import "server-only";
import { db } from "@/lib/db";
import { KnowledgeStatus } from "@/lib/generated/prisma/enums";
import { excerptFromHtml } from "@/lib/blog";
import type { ModerationItem } from "@/lib/moderation";

/**
 * GET /admin/content (§4.11) — "one shared moderation queue, not a separate
 * one per domain" (§4.13). Pulls the three domains' independently-flagged
 * rows into a single list, newest first, rather than three separate tabs.
 */
export async function getFlaggedContent(): Promise<ModerationItem[]> {
  const [posts, knowledgeItems, forumPosts] = await Promise.all([
    db.post.findMany({
      where: { flagged: true },
      select: {
        id: true,
        title: true,
        slug: true,
        body: true,
        flagReason: true,
        createdAt: true,
        author: { select: { name: true } },
      },
    }),
    db.knowledgeItem.findMany({
      where: { status: KnowledgeStatus.flagged },
      select: {
        id: true,
        title: true,
        description: true,
        flagReason: true,
        createdAt: true,
        contributor: { select: { name: true } },
      },
    }),
    db.forumPost.findMany({
      where: { flagged: true },
      select: {
        id: true,
        body: true,
        flagReason: true,
        createdAt: true,
        author: { select: { name: true } },
        thread: { select: { id: true, title: true, forum: { select: { slug: true } } } },
      },
    }),
  ]);

  const items: ModerationItem[] = [
    ...posts.map((post) => ({
      id: post.id,
      type: "blog_post" as const,
      title: post.title,
      excerpt: excerptFromHtml(post.body),
      authorName: post.author.name,
      flagReason: post.flagReason,
      createdAt: post.createdAt.toISOString(),
      href: `/blog/${post.slug}`,
    })),
    ...knowledgeItems.map((item) => ({
      id: item.id,
      type: "library_item" as const,
      title: item.title,
      excerpt: item.description,
      authorName: item.contributor.name,
      flagReason: item.flagReason,
      createdAt: item.createdAt.toISOString(),
      href: "/library",
    })),
    ...forumPosts.map((post) => ({
      id: post.id,
      type: "forum_post" as const,
      title: post.thread.title,
      excerpt: post.body,
      authorName: post.author.name,
      flagReason: post.flagReason,
      createdAt: post.createdAt.toISOString(),
      href: `/forums/${post.thread.forum.slug}/${post.thread.id}`,
    })),
  ];

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Cheap count for the `/admin` dashboard badge — avoids fetching full rows just to size the queue. */
export async function getFlaggedContentCount(): Promise<number> {
  const [posts, knowledgeItems, forumPosts] = await Promise.all([
    db.post.count({ where: { flagged: true } }),
    db.knowledgeItem.count({ where: { status: KnowledgeStatus.flagged } }),
    db.forumPost.count({ where: { flagged: true } }),
  ]);

  return posts + knowledgeItems + forumPosts;
}
