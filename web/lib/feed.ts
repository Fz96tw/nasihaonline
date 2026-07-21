// Client-safe "What's New" feed types (unifies Events/Blog/Knowledge
// Library/Forums/Announcements into one chronological list) — mirrors
// lib/blog.ts's split between plain data shapes (this file) and DB-touching
// queries (lib/feed-server.ts).

export type FeedItemType = "event" | "post" | "library" | "forum_thread" | "announcement" | "survey";

export const FEED_TYPE_LABELS: Record<FeedItemType, string> = {
  event: "Event",
  post: "Blog",
  library: "Library",
  forum_thread: "Forum",
  announcement: "Announcement",
  survey: "Survey",
};

export const FEED_TYPES = Object.keys(FEED_TYPE_LABELS) as FeedItemType[];

export function isFeedItemType(value: string | null | undefined): value is FeedItemType {
  return value != null && (FEED_TYPES as string[]).includes(value);
}

export type FeedItem = {
  type: FeedItemType;
  id: string;
  title: string;
  excerpt: string;
  href: string;
  /** ISO timestamp this item was published/created — the feed's sort key. */
  timestamp: string;
  author: { name: string | null; avatarUrl: string | null };
  /** Events, blog posts, announcements, and surveys carry a hero image — null for library items and forum threads. */
  imageUrl: string | null;
  /** Only blog posts carry the eye/comment counts shown on /blog/[slug] (§4.8) — undefined for every other type. */
  stats?: { views: number; comments: number };
  /** Only events carry a registered/RSVP'd count — undefined for every other type. */
  attendeeCount?: number;
  /** Only events carry a start time (§4.5/§4.6 calendar) — undefined for every other type. */
  eventStartsAt?: string;
  /** Only events with a linked Events-forum thread (§4.6) carry this — undefined when the event has no thread. */
  forumReplyCount?: number;
  /** Only events carry a detail-page unique-visitor count (§4.6) — undefined for every other type. */
  eventViewCount?: number;
};

// Marks a feed row's href so the page it lands on (blog post, forum thread,
// calendar, library — all reachable from elsewhere too) can show a "back to
// the feed" link only when the visit actually came from there.
export const FEED_REF_PARAM = "ref";
export const FEED_REF_VALUE = "whats-new";

export function withFeedRef(href: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${FEED_REF_PARAM}=${FEED_REF_VALUE}`;
}

export function isFromFeed(searchParams?: Record<string, string | string[] | undefined>): boolean {
  return searchParams?.[FEED_REF_PARAM] === FEED_REF_VALUE;
}

export type FeedCursor = { ts: string; id: string };

// A plain JSON+encodeURIComponent cursor (not base64) — it only ever needs
// to round-trip through a URL query param, and this avoids relying on
// Buffer/btoa, which differ between server and browser environments.
export function encodeFeedCursor(cursor: FeedCursor): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

export function decodeFeedCursor(value: string | null | undefined): FeedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (parsed && typeof parsed.ts === "string" && typeof parsed.id === "string") {
      return { ts: parsed.ts, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}
