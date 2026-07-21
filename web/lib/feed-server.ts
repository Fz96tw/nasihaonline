import "server-only";
import { db } from "@/lib/db";
import { KnowledgeStatus, RSVPStatus, SurveyStatus } from "@/lib/generated/prisma/enums";
import { getProfileAvatarUrl, getPostHeroImageUrl, getEventHeroImageUrl, getAnnouncementHeroImageUrl, getSurveyHeroImageUrl } from "@/lib/storage";
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

// Every admin-broadcast content type (Board Announcements, Surveys)
// deliberately masks the sending admin behind a fixed institutional
// identity on every member-facing surface (feed row, detail page, email) —
// the real sender (Announcement.authorId / Survey.authorId) is only ever
// shown unmasked in the admin history list (lib/announcements-server.ts,
// lib/surveys-server.ts).
const BOARD_SENDER = { name: "NASIHA Board", avatarUrl: "/images/nasihalogo-cropped.png" };

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
  /** Restrict to these feed types; omit/undefined for the full merged feed. */
  types?: FeedItem["type"][];
}): Promise<{ items: FeedItem[]; nextCursor: FeedCursor | null; hasMore: boolean }> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const before = params.cursor ? new Date(params.cursor.ts) : null;
  const wants = (type: FeedItem["type"]) => !params.types || params.types.includes(type);

  const [events, posts, libraryItems, forumThreads, announcements, surveys] = await Promise.all([
    !wants("event") ? Promise.resolve([]) : db.event.findMany({
      where: before ? { createdAt: { lt: before } } : {},
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        startsAt: true,
        heroImageUrl: true,
        host: { select: AUTHOR_SELECT },
        // Going RSVPs (members) plus EventRegistrations (non-members) —
        // same merge as getEventEngagementForAdmin's attendee/interest count.
        _count: {
          select: {
            rsvps: { where: { status: RSVPStatus.going } },
            registrations: true,
            views: true,
          },
        },
        // posts includes the thread's own system-authored opening post, so
        // forumReplyCount below subtracts one — same convention as the
        // forumThreads feed query and getMemberEventById's forumReplyCount.
        forumThread: { select: { _count: { select: { posts: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
    }),
    !wants("post") ? Promise.resolve([]) : db.post.findMany({
      where: { publishedAt: { not: null }, ...(before ? { publishedAt: { lt: before } } : {}) },
      select: {
        id: true,
        title: true,
        slug: true,
        body: true,
        heroImageUrl: true,
        publishedAt: true,
        author: { select: AUTHOR_SELECT },
        // Comment rows carry `postId` directly regardless of reply nesting
        // (see PostComment's parentId self-relation), so this count already
        // matches lib/blog.ts's countAllComments total on the detail page.
        _count: { select: { comments: true, views: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: pageSize,
    }),
    !wants("library") ? Promise.resolve([]) : db.knowledgeItem.findMany({
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
    !wants("forum_thread") ? Promise.resolve([]) : db.forumThread.findMany({
      // eventId: null excludes the Events forum's auto-created threads —
      // those already surface as their parent Event's own feed row (with
      // forumReplyCount above), so listing them again here would be a
      // duplicate, bodiless-looking "Forum" row for the same activity.
      where: { eventId: null, ...(before ? { createdAt: { lt: before } } : {}) },
      select: {
        id: true,
        title: true,
        createdAt: true,
        author: { select: AUTHOR_SELECT },
        forum: { select: { name: true, slug: true } },
        // posts includes the thread's own opening post, so replyCount below
        // subtracts one — same convention as toThreadListItem in forums-server.ts.
        _count: { select: { posts: true, views: true } },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
    }),
    !wants("announcement") ? Promise.resolve([]) : db.announcement.findMany({
      where: {
        sentAt: { not: null },
        retractedAt: null,
        showInFeed: true,
        ...(before ? { sentAt: { lt: before } } : {}),
      },
      select: { id: true, title: true, body: true, heroImageUrl: true, sentAt: true },
      orderBy: { sentAt: "desc" },
      take: pageSize,
    }),
    // Only surveys currently accepting responses (status: open) and sent to
    // the member audience — a scheduled-but-not-yet-open or closed survey
    // has nothing for a member to do here, same "only show what's
    // actionable/live" rationale as Announcement's sentAt+retractedAt
    // filter. No author select needed — like Announcement, the real sending
    // admin is masked behind BOARD_SENDER on this member-facing surface.
    !wants("survey") ? Promise.resolve([]) : db.survey.findMany({
      where: {
        status: SurveyStatus.open,
        audienceMembers: true,
        ...(before ? { openedAt: { lt: before } } : {}),
      },
      select: { id: true, title: true, description: true, heroImageUrl: true, openedAt: true },
      orderBy: { openedAt: "desc" },
      take: pageSize,
    }),
  ]);

  const merged: FeedItem[] = [
    ...events.map((event): FeedItem => ({
      type: "event",
      id: event.id,
      title: event.title,
      excerpt: event.description ? truncate(event.description) : "No description provided.",
      href: withFeedRef(`/calendar/${event.id}`),
      timestamp: event.createdAt.toISOString(),
      author: authorOf(event.host),
      imageUrl: getEventHeroImageUrl(event.heroImageUrl),
      attendeeCount: event._count.rsvps + event._count.registrations,
      forumReplyCount: event.forumThread ? event.forumThread._count.posts - 1 : undefined,
      eventStartsAt: event.startsAt.toISOString(),
      eventViewCount: event._count.views,
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
      stats: { views: post._count.views, comments: post._count.comments },
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
      stats: { views: thread._count.views, comments: thread._count.posts - 1 },
    })),
    ...announcements.map((announcement): FeedItem => ({
      type: "announcement",
      id: announcement.id,
      title: announcement.title,
      excerpt: truncate(announcement.body),
      href: `/whats-new/announcements/${announcement.id}`,
      // sentAt is never null here — the where clause above excludes drafts.
      timestamp: (announcement.sentAt as Date).toISOString(),
      author: BOARD_SENDER,
      imageUrl: getAnnouncementHeroImageUrl(announcement.heroImageUrl),
    })),
    ...surveys.map((survey): FeedItem => ({
      type: "survey",
      id: survey.id,
      title: survey.title,
      excerpt: survey.description ? truncate(survey.description) : "Share your feedback.",
      href: withFeedRef(`/surveys/${survey.id}`),
      // openedAt is never null here — the where clause above filters to status: open.
      timestamp: (survey.openedAt as Date).toISOString(),
      author: BOARD_SENDER,
      imageUrl: getSurveyHeroImageUrl(survey.heroImageUrl),
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
    select: { id: true, title: true, body: true, heroImageUrl: true, sentAt: true, retractedAt: true },
  });
  if (!announcement || !announcement.sentAt || announcement.retractedAt) return null;

  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    sentAt: announcement.sentAt.toISOString(),
    author: BOARD_SENDER,
    imageUrl: getAnnouncementHeroImageUrl(announcement.heroImageUrl),
  };
}
