import "server-only";
import { db } from "@/lib/db";
import {
  EventVisibility,
  ForumThreadVisibility,
  KnowledgeStatus,
  KnowledgeVisibility,
  ReviewItemStatus,
  RSVPStatus,
  SurveyStatus,
  type Tier,
} from "@/lib/generated/prisma/enums";
import {
  getProfileAvatarUrl,
  getPostHeroImageUrl,
  getEventHeroImageUrl,
  getAnnouncementHeroImageUrl,
  getSurveyHeroImageUrl,
  getKnowledgeItemHeroImageUrl,
} from "@/lib/storage";
import { excerptFromHtml } from "@/lib/blog";
import { withFeedRef, type FeedItem, type FeedCursor } from "@/lib/feed";
import { youtubeThumbnailUrl } from "@/lib/youtube";

const DEFAULT_PAGE_SIZE = 20;
const EXCERPT_LENGTH = 180;

const AUTHOR_SELECT = {
  name: true,
  profile: { select: { avatarUrl: true, titleSpecialty: true, countryRegion: true, showSpecialtyLocation: true } },
} as const;

function truncate(text: string, maxLength = EXCERPT_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function authorOf(user: {
  name: string | null;
  profile: { avatarUrl: string | null; titleSpecialty: string | null; countryRegion: string | null; showSpecialtyLocation: boolean } | null;
}) {
  return {
    name: user.name,
    avatarUrl: getProfileAvatarUrl(user.profile?.avatarUrl ?? null),
    // Same showSpecialtyLocation enforcement as the Directory (lib/members-server.ts).
    titleSpecialty: user.profile?.showSpecialtyLocation ? user.profile.titleSpecialty : null,
    countryRegion: user.profile?.showSpecialtyLocation ? user.profile.countryRegion : null,
  };
}

// Every admin-broadcast content type (Board Announcements, Surveys)
// deliberately masks the sending admin behind a fixed institutional
// identity on every member-facing surface (feed row, detail page, email) —
// the real sender (Announcement.authorId / Survey.authorId) is only ever
// shown unmasked in the admin history list (lib/announcements-server.ts,
// lib/surveys-server.ts).
const BOARD_SENDER = {
  name: "NASIHA Board",
  avatarUrl: "/images/nasihalogo-cropped.png",
  titleSpecialty: null,
  countryRegion: null,
};

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
  /**
   * The signed-in viewer, for the events branch's audience-restriction
   * filter (Audience-Restricted Group Events, Objective 01) — an `invited`
   * event only ever appears in an invited member's feed, never its own
   * organizer's (confirmed with user: the host already knows they created
   * it, so it isn't "new" activity for them the way it is for an invitee).
   * Every non-event domain is unaffected by this param; pass null only
   * when there is genuinely no session (there's no signed-out caller of
   * this function today, but the type stays honest).
   */
  viewerId: string | null;
}): Promise<{ items: FeedItem[]; nextCursor: FeedCursor | null; hasMore: boolean }> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const before = params.cursor ? new Date(params.cursor.ts) : null;
  const wants = (type: FeedItem["type"]) => !params.types || params.types.includes(type);
  const viewerId = params.viewerId;

  const [events, posts, libraryItems, forumThreads, announcements, surveys, seekingReviewItems] = await Promise.all([
    !wants("event") ? Promise.resolve([]) : db.event.findMany({
      where: {
        ...(before ? { createdAt: { lt: before } } : {}),
        cancelledAt: null,
        OR: [
          { visibility: EventVisibility.community },
          ...(viewerId ? [{ invitees: { some: { userId: viewerId } } }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        startsAt: true,
        heroImageUrl: true,
        visibility: true,
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
      where: {
        status: KnowledgeStatus.published,
        ...(before ? { createdAt: { lt: before } } : {}),
        // Same restricted-audience shape as the events branch above
        // (Objective 04's read-path filter, mirrored here): a restricted
        // item only ever reaches an invited member's feed, never its own
        // contributor's — the contributor already knows they submitted it,
        // same "not new activity for them" rationale as restricted events.
        OR: [
          { visibility: KnowledgeVisibility.public },
          ...(viewerId ? [{ invitees: { some: { userId: viewerId } } }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        youtubeUrl: true,
        heroImageUrl: true,
        visibility: true,
        contributor: { select: AUTHOR_SELECT },
        _count: { select: { views: true } },
        // posts includes the thread's own system-authored opening post, so
        // forumReplyCount below subtracts one — same convention as the
        // events branch above.
        forumThread: { select: { _count: { select: { posts: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: pageSize,
    }),
    !wants("forum_thread") ? Promise.resolve([]) : db.forumThread.findMany({
      // eventId: null excludes the Events forum's auto-created threads —
      // those already surface as their parent Event's own feed row (with
      // forumReplyCount above), so listing them again here would be a
      // duplicate, bodiless-looking "Forum" row for the same activity.
      // knowledgeItemId: null excludes the Library's on-demand discussion
      // threads for the same reason. Beyond de-duplication, the OR below is
      // Member-Initiated Restricted Forum Threads' (§4.13/§11.16) own
      // per-viewer visibility filter — same shape as the events/library
      // branches above — since a standalone thread can now independently
      // carry `visibility: invited`.
      where: {
        eventId: null,
        knowledgeItemId: null,
        // lastActivityAt (bumped by every new reply, see createForumPost) is
        // the sort/cursor field here rather than createdAt, so a thread with
        // fresh activity resurfaces near the top instead of only ever
        // appearing once at its original creation time.
        ...(before ? { lastActivityAt: { lt: before } } : {}),
        OR: [
          { visibility: ForumThreadVisibility.community },
          ...(viewerId ? [{ invitees: { some: { userId: viewerId } } }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        lastActivityAt: true,
        author: { select: AUTHOR_SELECT },
        forum: { select: { name: true, slug: true } },
        // Latest post's author + body — a bump from a reply should credit
        // the replier (not the thread creator) and show what they wrote.
        // Falls back to `author` above when the thread has no posts yet.
        posts: {
          select: { author: { select: AUTHOR_SELECT }, body: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        // posts includes the thread's own opening post, so replyCount below
        // subtracts one — same convention as toThreadListItem in forums-server.ts.
        _count: { select: { posts: true, views: true } },
      },
      orderBy: { lastActivityAt: "desc" },
      take: pageSize,
    }),
    !wants("announcement") ? Promise.resolve([]) : db.announcement.findMany({
      where: {
        sentAt: { not: null },
        retractedAt: null,
        showInFeed: true,
        ...(before ? { sentAt: { lt: before } } : {}),
      },
      select: { id: true, title: true, body: true, heroImageUrl: true, sentAt: true, welcomeTier: true },
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
    // Peer Review & Feedback items — open-call (seekingReviewers) items are
    // public to every member, same as before. Invite-only items now follow
    // the same viewer-based OR-clause as the events/library restricted-
    // audience branches above: they only ever reach the submitter or an
    // invited reviewer's own feed, never a bystander's. Listing-only: only
    // title/description/submitter/hero-image are selected here, never the
    // attachment/externalUrl/youtubeUrl — the actual material stays gated
    // behind canViewReviewItem/an accepted offer on the detail page, same as
    // the dashboard's "Members Seeking Reviewers" tab.
    !wants("peer_review") ? Promise.resolve([]) : db.reviewItem.findMany({
      where: {
        status: ReviewItemStatus.open,
        OR: [
          { seekingReviewers: true },
          ...(viewerId
            ? [{ submitterId: viewerId }, { invitees: { some: { userId: viewerId } } }]
            : []),
        ],
        // lastActivityAt (bumped by toggleSeekingReviewers whenever the
        // audience changes, see review-server.ts) is the sort/cursor field
        // here rather than createdAt, so an item whose audience was just
        // opened/closed resurfaces near the top — same convention as the
        // forumThreads branch above keying off its own lastActivityAt.
        ...(before ? { lastActivityAt: { lt: before } } : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        volunteerNote: true,
        lastActivityAt: true,
        heroImageUrl: true,
        submitterId: true,
        seekingReviewers: true,
        submitter: { select: AUTHOR_SELECT },
        // Empty-string sentinel when there's no viewer — never a real user
        // id, so the where clause just matches nothing instead of needing a
        // conditional select shape.
        volunteerOffers: { where: { userId: viewerId ?? "" }, select: { status: true } },
      },
      orderBy: { lastActivityAt: "desc" },
      take: pageSize,
    }),
  ]);

  const merged: FeedItem[] = [
    ...events.map((event): FeedItem => ({
      type: "event",
      id: event.id,
      title: event.title,
      // Restricted events only ever reach a viewer who is the organizer or
      // an invited member (the where clause above), so this framing is
      // always correct for whoever sees it — no per-viewer branching needed.
      excerpt:
        event.visibility === EventVisibility.invited
          ? `${event.host.name ?? "The host"} has requested your attendance. Please RSVP.`
          : event.description
            ? truncate(event.description)
            : "No description provided.",
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
      // Restricted items only ever reach a viewer who is an invited member
      // (the where clause above), so this framing is always correct for
      // whoever sees it — no per-viewer branching needed, same rationale as
      // the events branch's excerpt swap.
      excerpt:
        item.visibility === KnowledgeVisibility.restricted
          ? `${item.contributor.name ?? "A member"} shared this with you.`
          : truncate(item.description),
      href: withFeedRef(`/library/${item.id}`),
      timestamp: item.createdAt.toISOString(),
      author: authorOf(item.contributor),
      // A custom hero image always wins; a recorded_lecture with none set
      // falls back to its video's YouTube thumbnail as the default cover —
      // same precedence as LibraryItemCard's browse-grid thumbnail.
      imageUrl: getKnowledgeItemHeroImageUrl(item.heroImageUrl) ?? (item.youtubeUrl ? youtubeThumbnailUrl(item.youtubeUrl) : null),
      libraryViewCount: item._count.views,
      forumReplyCount: item.forumThread ? item.forumThread._count.posts - 1 : undefined,
    })),
    ...forumThreads.map((thread): FeedItem => {
      // A thread bumped up by a fresh reply (lastActivityAt > createdAt)
      // reads as "Replied to" rather than "New thread" — it isn't new,
      // it's resurfacing, and the row's author is the replier, not the
      // thread's original creator.
      const isReply = thread.lastActivityAt.getTime() > thread.createdAt.getTime();
      const latestPost = thread.posts[0];
      return {
        type: "forum_thread",
        id: thread.id,
        title: thread.title,
        excerpt: isReply
          ? `Replied to a thread in ${thread.forum.name}`
          : `New thread in ${thread.forum.name}`,
        href: withFeedRef(`/forums/${thread.forum.slug}/${thread.id}`),
        timestamp: thread.lastActivityAt.toISOString(),
        author: authorOf(latestPost?.author ?? thread.author),
        // Forum threads have no per-thread hero image (no upload UI, no
        // schema column) — every thread shows the same static default so the
        // feed row still gets a thumbnail (see FeedRow's forum_thread layout).
        imageUrl: "/images/forum-thread.jpg",
        stats: { views: thread._count.views, comments: thread._count.posts - 1 },
        replyExcerpt: isReply && latestPost ? truncate(latestPost.body) : undefined,
      };
    }),
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
      titleTier: announcement.welcomeTier,
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
    ...seekingReviewItems.map((item): FeedItem => {
      const isSubmitter = viewerId != null && item.submitterId === viewerId;
      return {
        type: "peer_review",
        id: item.id,
        title: item.title,
        // An invite-only item only ever reaches the submitter or an invited
        // reviewer (the where clause above) — for the invitee this reads as
        // an invitation rather than the plain description, same framing
        // swap as the restricted events/library branches above. The
        // submitter still sees their own plain description, same as an
        // open-call item.
        excerpt:
          !item.seekingReviewers && !isSubmitter
            ? `${item.submitter.name ?? "A member"} invited you to review this.`
            : truncate(item.description),
        href: withFeedRef(`/review-feedback/${item.id}`),
        timestamp: item.lastActivityAt.toISOString(),
        author: authorOf(item.submitter),
        imageUrl: getKnowledgeItemHeroImageUrl(item.heroImageUrl),
        // Every open-call item shows the "Open for reviewer volunteers"
        // label, including on the submitter's own feed row — it's status
        // information, not just a CTA. The inline "Offer to Review" button
        // next to it is a separate, narrower gate: only a non-submitter can
        // actually click it (offerToReview rejects a self-offer server-side
        // too, see review-server.ts).
        reviewOfferPrompt: item.seekingReviewers ? "Open for reviewer volunteers" : null,
        canOfferToReview: item.seekingReviewers && !isSubmitter,
        myOfferStatus: item.volunteerOffers[0]?.status ?? null,
        volunteerNote: item.volunteerNote,
      };
    }),
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
  /** Only the welcome-new-member Announcement carries this — the member's tier, rendered as a badge after their name in the title. */
  titleTier: Tier | null;
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
    select: { id: true, title: true, body: true, heroImageUrl: true, sentAt: true, retractedAt: true, welcomeTier: true },
  });
  if (!announcement || !announcement.sentAt || announcement.retractedAt) return null;

  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    sentAt: announcement.sentAt.toISOString(),
    author: BOARD_SENDER,
    imageUrl: getAnnouncementHeroImageUrl(announcement.heroImageUrl),
    titleTier: announcement.welcomeTier,
  };
}
