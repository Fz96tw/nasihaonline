// Client-safe "What's New" feed types (unifies Events/Blog/Knowledge
// Library/Forums/Announcements into one chronological list) — mirrors
// lib/blog.ts's split between plain data shapes (this file) and DB-touching
// queries (lib/feed-server.ts).

import type { ReviewVolunteerStatus, Tier } from "@/lib/generated/prisma/enums";

export type FeedItemType = "event" | "library" | "forum_thread" | "announcement" | "survey" | "peer_review";

export const FEED_TYPE_LABELS: Record<FeedItemType, string> = {
  event: "Event",
  library: "Library",
  forum_thread: "Forum",
  announcement: "Announcement",
  survey: "Survey",
  peer_review: "Peer Review",
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
  author: { name: string | null; avatarUrl: string | null; titleSpecialty: string | null; countryRegion: string | null };
  /** Events, blog posts, announcements, and surveys carry a hero image; library items get one only for recorded lectures (YouTube thumbnail) — null otherwise. Forum threads always carry the same static default (/images/forum-thread.jpg), rendered by FeedRow as a small left-side thumbnail rather than the full-width image used by other types. */
  imageUrl: string | null;
  /** Only forum threads carry the combined eye/reply count shown on their detail page — undefined for every other type. Library items (including blog_post) carry libraryViewCount + forumReplyCount separately instead. */
  stats?: { views: number; comments: number };
  /** Only events carry a registered/RSVP'd count — undefined for every other type. */
  attendeeCount?: number;
  /** Only events carry a start time (§4.5/§4.6 calendar) — undefined for every other type. */
  eventStartsAt?: string;
  /** Events with a linked Events-forum thread (§4.6) or library items with a started on-demand discussion thread (§4.9) carry this — undefined when there's no thread yet. */
  forumReplyCount?: number;
  /** Only events carry a detail-page unique-visitor count (§4.6) — undefined for every other type. */
  eventViewCount?: number;
  /** Only library items carry a detail-page unique-visitor count (§4.9) — undefined for every other type. */
  libraryViewCount?: number;
  /** Only the welcome-new-member Announcement carries this — the member's tier, rendered as a badge after their name in the title. Null/undefined for every other Announcement and every other type. */
  titleTier?: Tier | null;
  /** Only "peer_review" items with an open call (seekingReviewers) carry this — a short status label ("Open for reviewer volunteers") shown next to a Hand icon on every viewer's feed row, including the submitter's own. Null for an invite-only item; undefined for every other type. Whether an inline ReviewOfferButton also renders next to it is driven separately by canOfferToReview. */
  reviewOfferPrompt?: string | null;
  /** Only "peer_review" items carry this — true when the viewer can click "Offer to Review" straight from the feed row (open call, and not their own submission). Undefined for every other type; false (not undefined) for the submitter's own open-call entry or an invite-only item, so reviewOfferPrompt can still render as a label-only row. */
  canOfferToReview?: boolean;
  /** Only "peer_review" items carry this — the viewer's own volunteer offer status, driving the inline ReviewOfferButton's initial state. Undefined when canOfferToReview is false. */
  myOfferStatus?: ReviewVolunteerStatus | null;
  /** Only "peer_review" items carry this — the submitter's optional note on what kind of feedback they're after, shown to prospective volunteers. Undefined for every other type; null when the submitter left it blank. */
  volunteerNote?: string | null;
  /** Only "forum_thread" items bumped up by a fresh reply (rather than freshly created) carry this — a truncated snippet of that reply's body, so the feed row shows what was actually said rather than just a "new activity" label. Undefined for a freshly created thread or every other type. */
  replyExcerpt?: string;
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
