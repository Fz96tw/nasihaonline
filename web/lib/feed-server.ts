import "server-only";
import { db } from "@/lib/db";
import { KnowledgeStatus } from "@/lib/generated/prisma/enums";
import { getProfileAvatarUrl, getPostHeroImageUrl, getAnnouncementHeroImageUrl } from "@/lib/storage";
import { excerptFromHtml } from "@/lib/blog";
import { withFeedRef, type FeedItem, type FeedCursor } from "@/lib/feed";

const DEFAULT_PAGE_SIZE = 20;
const EXCERPT_LENGTH = 180;

const AUTHOR_SELECT = { name: true, profile: { select: { avatarUrl: true } } } as const;

function truncate(text: string, maxLength = EXCERPT_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function authorOf(user: { name: string | null; profile: { avatarUrl: string | null } | null }) {
  return { name: user.name, avatarUrl: getProfileAvatarUrl(user.profile?.avatarUrl ?? null) };
}

// Board Announcements deliberately mask the sending admin behind a fixed
// institutional identity on every member-facing surface (feed row, detail
// page, email) — the real sender (Announcement.authorId) is only ever shown
// unmasked in the admin history list (lib/announcements-server.ts).
const ANNOUNCEMENT_SENDER = { name: "NASIHA Board", avatarUrl: "/images/nasihalogo-cropped.png" };

/**
 * "What's New" feed (member-only) — merges five domains at query time
 * (Event/Post/KnowledgeItem/ForumThread/Announcement) rather than a
 * denormalized feed table, same "one *-server.ts query per domain" shape
 * dashboard's widgets already use. Only new ForumThreads are feed events,
 * not individual ForumPost replies — keeps the feed as high-signal as the
 * other domains (one row per event/post/library item/thread).
 *
 * Cursor pagination, not offset: every domain is re-queried against the
 * same global `{ts, id}` cursor each page (not its own prior position), so
 * pages stay gap/dupe-free even as new content is created between loads.
 * Exact-millisecond ties across domains are an accepted, extremely rare
 * edge case — not worth compound OR where-clauses to close.
 */
export async function getFeedPage(params: {
  cursor: FeedCursor | null;
  pageSize?: number;
}): Promise<{ items: FeedItem[]; nextCursor: FeedCursor | null; hasMore: boolean }> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const before = params.cursor ? new Date(params.cursor.ts) : null;

  const [events, posts, libraryItems, forumThreads, announcements] = await Promise.all([
    db.event.findMany({
      where: before ? { createdAt: { lt: before } } : {},
      select: { id: true, title: true, description: true, createdAt: true, host: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: "desc" },
      take: pageSize,
    }),
    db.post.findMany({
      where: { publishedAt: { not: null }, ...(before ? { publishedAt: { lt: before } } : {}) },
      select: {
        id: true,
        title: true,
        slug: true,
        body: true,
        heroImageUrl: true,
        publishedAt: true,
        author: { select: AUTHOR_SELECT },
      },
      orderBy: { publishedAt: "desc" },
      take: pageSize,
    }),
    db.knowledgeItem.findMany({
      where: { status: KnowledgeStatus.published, ...(before ? { createdAt: { lt: before } } : {}) },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        contributor: { select: AUTHOR_SELECT },
        category: { select: { slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
    }),
    db.forumThread.findMany({
      where: before ? { createdAt: { lt: before } } : {},
      select: {
        id: true,
        title: true,
        createdAt: true,
        author: { select: AUTHOR_SELECT },
        forum: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
    }),
    db.announcement.findMany({
      where: { sentAt: { not: null }, ...(before ? { sentAt: { lt: before } } : {}) },
      select: { id: true, title: true, body: true, heroImageUrl: true, sentAt: true },
      orderBy: { sentAt: "desc" },
      take: pageSize,
    }),
  ]);

  const merged: FeedItem[] = [
    ...events.map((event): FeedItem => ({
      type: "event",
      id: event.id,
      title: event.title,
      excerpt: event.description ? truncate(event.description) : "No description provided.",
      href: withFeedRef("/calendar"),
      timestamp: event.createdAt.toISOString(),
      author: authorOf(event.host),
      imageUrl: null,
    })),
    ...posts.map((post): FeedItem => ({
      type: "post",
      id: post.id,
      title: post.title,
      excerpt: excerptFromHtml(post.body, EXCERPT_LENGTH),
      href: withFeedRef(`/blog/${post.slug}`),
      // publishedAt is never null here — the where clause above excludes drafts.
      timestamp: (post.publishedAt as Date).toISOString(),
      author: authorOf(post.author),
      imageUrl: getPostHeroImageUrl(post.heroImageUrl),
    })),
    ...libraryItems.map((item): FeedItem => ({
      type: "library",
      id: item.id,
      title: item.title,
      excerpt: truncate(item.description),
      href: withFeedRef(`/library?category=${item.category.slug}`),
      timestamp: item.createdAt.toISOString(),
      author: authorOf(item.contributor),
      imageUrl: null,
    })),
    ...forumThreads.map((thread): FeedItem => ({
      type: "forum_thread",
      id: thread.id,
      title: thread.title,
      excerpt: `New thread in ${thread.forum.name}`,
      href: withFeedRef(`/forums/${thread.forum.slug}/${thread.id}`),
      timestamp: thread.createdAt.toISOString(),
      author: authorOf(thread.author),
      imageUrl: null,
    })),
    ...announcements.map((announcement): FeedItem => ({
      type: "announcement",
      id: announcement.id,
      title: announcement.title,
      excerpt: truncate(announcement.body),
      href: `/whats-new/announcements/${announcement.id}`,
      // sentAt is never null here — the where clause above excludes drafts.
      timestamp: (announcement.sentAt as Date).toISOString(),
      author: ANNOUNCEMENT_SENDER,
      imageUrl: getAnnouncementHeroImageUrl(announcement.heroImageUrl),
    })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const hasMore = merged.length > pageSize;
  const items = merged.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? { ts: last.timestamp, id: last.id } : null;

  return { items, nextCursor, hasMore };
}

export type AnnouncementDetail = {
  id: string;
  title: string;
  body: string;
  sentAt: string;
  author: { name: string | null; avatarUrl: string | null };
  imageUrl: string | null;
};

/**
 * A single sent Announcement (§4.10), for the minimal detail page a feed
 * row links to — Announcements have no other read surface in the app today
 * (previously only ever rendered as an inbox Notification), so this is a
 * new read path introduced for the feed's click-through.
 */
export async function getSentAnnouncement(id: string): Promise<AnnouncementDetail | null> {
  const announcement = await db.announcement.findUnique({
    where: { id },
    select: { id: true, title: true, body: true, heroImageUrl: true, sentAt: true },
  });
  if (!announcement || !announcement.sentAt) return null;

  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    sentAt: announcement.sentAt.toISOString(),
    author: ANNOUNCEMENT_SENDER,
    imageUrl: getAnnouncementHeroImageUrl(announcement.heroImageUrl),
  };
}
