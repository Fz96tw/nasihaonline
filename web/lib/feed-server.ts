import "server-only";
import { db } from "@/lib/db";
import {
  EventVisibility,
  ForumThreadVisibility,
  KnowledgeStatus,
  KnowledgeVisibility,
  ReviewItemStatus,
  Role,
  RSVPStatus,
  SurveyStatus,
  type Tier,
} from "@/lib/generated/prisma/enums";
import {
  getProfileAvatarUrl,
  getEventHeroImageUrl,
  getAnnouncementHeroImageUrl,
  getSurveyHeroImageUrl,
  getKnowledgeItemHeroImageUrl,
} from "@/lib/storage";
import { withFeedRef, type FeedItem, type FeedCursor } from "@/lib/feed";
import { extractSnippet, textContainsMatch } from "@/lib/text-highlight";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import {
  searchEventDocuments,
  searchLibraryDocuments,
  searchForumDocuments,
  searchAnnouncementDocuments,
  searchSurveyDocuments,
  searchReviewItemDocuments,
} from "@/lib/meilisearch";
import {
  isThreadVisible,
  EVENT_THREAD_ACCESS_SELECT,
  KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
} from "@/lib/forums-server";
import { COMMUNITY_FEEDBACK_FORUM_SLUG } from "@/lib/forums";
import { getInboxList } from "@/lib/inbox-server";
import { matchesInboxSearch } from "@/lib/inbox";

const DEFAULT_PAGE_SIZE = 20;
const EXCERPT_LENGTH = 180;
// In search mode, a forum thread's excerpt needs to come from whichever post
// actually contains the match (Meilisearch's ForumSearchDocument.body
// concatenates every post, but the feed row can only show one) — not
// necessarily the latest one, which is all browse mode ever needs. Capped
// rather than unbounded to keep a very long thread's search-mode query cost
// bounded.
const SEARCH_POST_SCAN_LIMIT = 30;

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
   * The signed-in viewer, for every domain's audience-restriction filter
   * (Audience-Restricted Group Events, Objective 01, and its analogues for
   * Library/Forum/ReviewItem) — an `invited`/`restricted` item appears in
   * an invited member's feed, and (per a later revision of this design) in
   * its own creator's feed too. Pass null only when there is genuinely no
   * session (there's no signed-out caller of this function today, but the
   * type stays honest).
   */
  viewerId: string | null;
  /** Needed only to grant admin/moderator the same "can view anything" bypass search already gave them via the old header search — see `isPrivileged` below. Ignored when `q` is absent. */
  viewerRole?: Role;
  /**
   * Free-text search (What's New feed's own inline search box, just below
   * the type filter pills — not a separate search UI). When present, each
   * domain's Meilisearch index (lib/meilisearch.ts) is queried first for
   * relevance-ranked hit ids, then that domain's existing Prisma query below
   * is additionally constrained to `id: { in: hitIds }` — layered on top of
   * the same per-viewer visibility where-clause every domain already
   * applies for the ordinary (unsearched) feed, *plus* an extra "you can
   * view this at all" bypass (owner/contributor/host/author, or
   * admin/moderator) that only activates in search mode. Without that
   * bypass, search would inherit the ordinary feed's narrower "is this new
   * activity for you" semantics — which deliberately excludes an item from
   * its own restricted-visibility creator's feed (see the events/library
   * branches' comments below) — and a member searching for their own
   * restricted content, or an admin searching for anything, would get
   * nothing back even though they're fully authorized to view it. This
   * bypass is genuinely search-only: it must never loosen the ordinary
   * feed's browse behavior, which is why it's gated on `query` being set.
   */
  q?: string;
}): Promise<{ items: FeedItem[]; nextCursor: FeedCursor | null; hasMore: boolean; totalCount?: number }> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const before = params.cursor ? new Date(params.cursor.ts) : null;
  const wants = (type: FeedItem["type"]) => !params.types || params.types.includes(type);
  const viewerId = params.viewerId;
  const query = params.q?.trim() || null;
  // In search mode, center each item's excerpt on the actual match instead
  // of always truncating from the start — falls back to a plain leading
  // truncation when this particular field doesn't contain the query (the
  // hit may have matched a different indexed field, e.g. author name).
  const excerptOf = (text: string) => (query ? extractSnippet(text, query) : truncate(text));
  const isPrivileged = params.viewerRole === Role.admin || params.viewerRole === Role.moderator;
  // A restricted-visibility item's own creator now sees it in their own
  // feed too (confirmed with user — reverses the earlier "not new to them"
  // design), so this bypass applies unconditionally, browse or search.
  const ownerBypass = (ownerClause: Record<string, unknown> | null) => (ownerClause ? [ownerClause] : []);
  // Admin/moderator "can view anything" bypass, search-mode only —
  // unconditional `{}` matches every row (Prisma's empty-object filter is
  // "no constraint"), same trick used for the id-filter shortcut above.
  // Deliberately NOT extended to ordinary browsing: an admin's feed should
  // still only show their own new/relevant activity, not every restricted
  // item in the app.
  const adminBypass = () => (query && isPrivileged ? [{}] : []);

  // null = search inactive, no id filter applied to that domain; [] = search
  // active but zero Meilisearch hits, so the domain's query below should
  // deliberately match nothing rather than falling through to the unfiltered
  // browse behavior. Skipped entirely for a domain the caller doesn't want,
  // same short-circuit `wants()` already uses elsewhere in this function.
  const [eventHitIds, libraryHitIds, forumHitIds, announcementHitIds, surveyHitIds, reviewHitIds] = !query
    ? [null, null, null, null, null, null]
    : await Promise.all([
        wants("event") ? searchEventDocuments(query).then((hits) => hits.map((hit) => hit.id)) : Promise.resolve([]),
        wants("library")
          ? searchLibraryDocuments(query).then((hits) => hits.map((hit) => hit.id))
          : Promise.resolve([]),
        wants("forum_thread")
          ? searchForumDocuments(query, { excludeForumSlug: COMMUNITY_FEEDBACK_FORUM_SLUG }).then((hits) =>
              hits.map((hit) => hit.id),
            )
          : Promise.resolve([]),
        wants("announcement")
          ? searchAnnouncementDocuments(query).then((hits) => hits.map((hit) => hit.id))
          : Promise.resolve([]),
        wants("survey")
          ? searchSurveyDocuments(query).then((hits) => hits.map((hit) => hit.id))
          : Promise.resolve([]),
        wants("peer_review")
          ? searchReviewItemDocuments(query).then((hits) => hits.map((hit) => hit.id))
          : Promise.resolve([]),
      ]);

  const [events, libraryItems, forumThreads, announcements, surveys, seekingReviewItems, inboxRaw] = await Promise.all([
    !wants("event") || eventHitIds?.length === 0 ? Promise.resolve([]) : db.event.findMany({
      where: {
        ...(before ? { createdAt: { lt: before } } : {}),
        ...(eventHitIds ? { id: { in: eventHitIds } } : {}),
        cancelledAt: null,
        OR: [
          { visibility: EventVisibility.community },
          ...(viewerId ? [{ invitees: { some: { userId: viewerId } } }] : []),
          ...ownerBypass(viewerId ? { hostId: viewerId } : null),
          ...adminBypass(),
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
    !wants("library") || libraryHitIds?.length === 0 ? Promise.resolve([]) : db.knowledgeItem.findMany({
      where: {
        // Ordinary browse only ever shows `published` — a `flagged` item
        // shouldn't read as "fresh" activity while under moderation review
        // even though it's still reachable via its own existing links. In
        // search mode, widen to match syncKnowledgeItemToIndex's own
        // index-eligibility (published or flagged) — the old header search
        // found flagged items too, and this is a deliberate "find anything
        // you can view" tool, not a "what's new" one.
        status: query ? { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] } : KnowledgeStatus.published,
        ...(before ? { createdAt: { lt: before } } : {}),
        ...(libraryHitIds ? { id: { in: libraryHitIds } } : {}),
        // Same restricted-audience shape as the events branch above
        // (Objective 04's read-path filter, mirrored here): a restricted
        // item reaches an invited member's feed, and its own contributor's.
        OR: [
          { visibility: KnowledgeVisibility.public },
          ...(viewerId ? [{ invitees: { some: { userId: viewerId } } }] : []),
          ...ownerBypass(viewerId ? { contributorId: viewerId } : null),
          ...adminBypass(),
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
    !wants("forum_thread") || forumHitIds?.length === 0 ? Promise.resolve([]) : db.forumThread.findMany({
      // eventId: null/knowledgeItemId: null excludes the Events forum's
      // auto-created threads and the Library's on-demand discussion threads
      // during ordinary browse — those already surface as their parent
      // Event/KnowledgeItem's own feed row (with forumReplyCount above), so
      // listing them again here would be a duplicate, bodiless-looking
      // "Forum" row for the same activity. In search mode this exclusion is
      // dropped: a Meilisearch hit here means the query matched this
      // thread's actual text (root post or a reply), which the parent
      // Event/KnowledgeItem's own indexed document doesn't carry — hiding it
      // would silently throw away a real match. The isThreadVisible filter
      // below (after the query resolves) then re-applies the inherited
      // event/library visibility gate that the eventId/knowledgeItemId
      // exclusion made unnecessary here before. Beyond de-duplication, the
      // OR below is Member-Initiated Restricted Forum Threads' (§4.13/
      // §11.16) own per-viewer visibility filter — same shape as the
      // events/library branches above — since a standalone thread can now
      // independently carry `visibility: invited`.
      where: {
        ...(query ? {} : { eventId: null, knowledgeItemId: null }),
        // lastActivityAt (bumped by every new reply, see createForumPost) is
        // the sort/cursor field here rather than createdAt, so a thread with
        // fresh activity resurfaces near the top instead of only ever
        // appearing once at its original creation time.
        ...(before ? { lastActivityAt: { lt: before } } : {}),
        ...(forumHitIds ? { id: { in: forumHitIds } } : {}),
        OR: [
          { visibility: ForumThreadVisibility.community },
          ...(viewerId ? [{ invitees: { some: { userId: viewerId } } }] : []),
          ...ownerBypass(viewerId ? { authorId: viewerId } : null),
          ...adminBypass(),
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
          take: query ? SEARCH_POST_SCAN_LIMIT : 1,
        },
        // posts includes the thread's own opening post, so replyCount below
        // subtracts one — same convention as toThreadListItem in forums-server.ts.
        _count: { select: { posts: true, views: true } },
        // Only needed for the isThreadVisible filter below — never rendered.
        visibility: true,
        authorId: true,
        invitees: { select: { userId: true } },
        event: EVENT_THREAD_ACCESS_SELECT,
        knowledgeItem: KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
      },
      orderBy: { lastActivityAt: "desc" },
      take: pageSize,
    }).then((threads) => threads.filter((thread) => isThreadVisible(thread, viewerId ?? undefined, isPrivileged))),
    !wants("announcement") || announcementHitIds?.length === 0 ? Promise.resolve([]) : db.announcement.findMany({
      where: {
        sentAt: { not: null },
        retractedAt: null,
        showInFeed: true,
        ...(before ? { sentAt: { lt: before } } : {}),
        ...(announcementHitIds ? { id: { in: announcementHitIds } } : {}),
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
    !wants("survey") || surveyHitIds?.length === 0 ? Promise.resolve([]) : db.survey.findMany({
      where: {
        // Ordinary browse only shows `open` — nothing actionable about a
        // closed survey on the "what's new" feed. In search mode, widen to
        // match syncSurveyToIndex's own index-eligibility (open or closed —
        // no per-member visibility gate exists for Survey either way, see
        // that function's comment) — the old header search could find a
        // closed survey too.
        status: query ? { in: [SurveyStatus.open, SurveyStatus.closed] } : SurveyStatus.open,
        audienceMembers: true,
        ...(before ? { openedAt: { lt: before } } : {}),
        ...(surveyHitIds ? { id: { in: surveyHitIds } } : {}),
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
    !wants("peer_review") || reviewHitIds?.length === 0 ? Promise.resolve([]) : db.reviewItem.findMany({
      where: {
        // lastActivityAt (bumped by toggleSeekingReviewers whenever the
        // audience changes, see review-server.ts) is the sort/cursor field
        // here rather than createdAt, so an item whose audience was just
        // opened/closed resurfaces near the top — same convention as the
        // forumThreads branch above keying off its own lastActivityAt.
        ...(before ? { lastActivityAt: { lt: before } } : {}),
        ...(reviewHitIds ? { id: { in: reviewHitIds } } : {}),
        OR: [
          // Ordinary browse eligibility, unchanged: open-call items are
          // public to every member; invite-only items only ever reach the
          // submitter or an invited reviewer's own feed, never a bystander's.
          {
            status: ReviewItemStatus.open,
            OR: [
              { seekingReviewers: true },
              ...(viewerId
                ? [{ submitterId: viewerId }, { invitees: { some: { userId: viewerId } } }]
                : []),
            ],
          },
          // Search-mode-only: the submitter/invitee/admin "can view this at
          // all" bypass canViewReviewItem already grants elsewhere, extended
          // to a closed item too — the old header search could find a
          // closed submission for its owner, this restores that.
          ...(query && viewerId
            ? [{ submitterId: viewerId }, { invitees: { some: { userId: viewerId } } }]
            : []),
          ...adminBypass(),
        ],
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
        // Search mode only (take: 0 outside it — same "no query" cheapness
        // as the forum posts fetch above): ReviewItemSearchDocument's
        // commentsBody concatenates every comment, so a hit here can be a
        // comment match with nothing in `description` to excerpt — fetch
        // enough comments to find whichever one actually matched.
        comments: { select: { body: true }, take: query ? SEARCH_POST_SCAN_LIMIT : 0 },
      },
      orderBy: { lastActivityAt: "desc" },
      take: pageSize,
    }),
    // Inbox (private 1:1 messages + meeting requests) — deliberately NOT
    // Meilisearch-backed, unlike every other domain above: this is private
    // DM content, never community-visible, so it must never be synced to a
    // shared search index. Also deliberately search-only: it contributes
    // to a query'd feed page but never ordinary chronological browsing (a
    // member's own messages aren't "what's new" activity for the feed's
    // normal sense). It is also NEVER exposed to isPrivileged/adminBypass()
    // — every other domain's search-mode bypass is intentionally skipped
    // here; getInboxList(viewerId) is already hard-scoped to the viewer's
    // own mailbox, and this branch must stay that way regardless of role.
    !wants("inbox") || !query || !viewerId ? Promise.resolve([]) : getInboxList(viewerId),
  ]);

  // getInboxList has no cursor/take support (it's a full, already-sorted
  // fetch of one member's own mailbox), so search-match, `before`-cursor
  // filtering, and the pageSize bound every other domain gets from Prisma
  // are all applied here in JS instead. No re-sort needed — getInboxList
  // already returns items sorted desc by lastActivityAt, and filtering
  // preserves that order.
  // Shared with totalCount below (see there for why this is computed
  // unsliced/uncursored) rather than re-filtering inboxRaw twice.
  const matchedInboxRaw = query ? inboxRaw.filter((item) => matchesInboxSearch(item, query.toLowerCase())) : [];

  const inboxItems: FeedItem[] = !query
    ? []
    : matchedInboxRaw
        .filter((item) => !before || new Date(item.lastActivityAt) < before)
        .slice(0, pageSize)
        .map((item): FeedItem => {
          const base = {
            type: "inbox" as const,
            id: item.id,
            href: `/inbox?item=${item.id}`,
            timestamp: item.lastActivityAt,
            author: {
              name: item.otherPartyName,
              avatarUrl: item.otherPartyAvatarUrl,
              titleSpecialty: null,
              countryRegion: null,
            },
            imageUrl: null,
          };
          if (item.kind === "message") {
            return { ...base, title: item.subject ?? `Message from ${item.otherPartyName}`, excerpt: item.snippet };
          }
          const latestBody = [...item.messages].reverse().find((message) => message.body)?.body ?? null;
          return {
            ...base,
            title: `Meeting request: ${item.topic}`,
            excerpt: latestBody ? excerptOf(latestBody) : "View this meeting request.",
          };
        });

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
            ? excerptOf(event.description)
            : "No description provided.",
      href: withFeedRef(`/calendar/${event.id}`, query),
      timestamp: event.createdAt.toISOString(),
      author: authorOf(event.host),
      imageUrl: getEventHeroImageUrl(event.heroImageUrl),
      attendeeCount: event._count.rsvps + event._count.registrations,
      forumReplyCount: event.forumThread ? event.forumThread._count.posts - 1 : undefined,
      eventStartsAt: event.startsAt.toISOString(),
      eventViewCount: event._count.views,
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
          : excerptOf(item.description),
      href: withFeedRef(`/library/${item.id}`, query),
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
      // In search mode, prefer whichever fetched post actually contains the
      // match over always the latest — the latest post might not be why
      // this thread matched at all (see SEARCH_POST_SCAN_LIMIT above).
      const matchingPost = query ? thread.posts.find((post) => textContainsMatch(post.body, query)) : undefined;
      const excerptPost = query ? (matchingPost ?? latestPost) : latestPost;
      return {
        type: "forum_thread",
        id: thread.id,
        title: thread.title,
        excerpt: isReply
          ? `Replied to a thread in ${thread.forum.name}`
          : `New thread in ${thread.forum.name}`,
        href: withFeedRef(`/forums/${thread.forum.slug}/${thread.id}`, query),
        timestamp: thread.lastActivityAt.toISOString(),
        author: authorOf(excerptPost?.author ?? thread.author),
        // Forum threads have no per-thread hero image (no upload UI, no
        // schema column) — every thread shows the same static default so the
        // feed row still gets a thumbnail (see FeedRow's forum_thread layout).
        imageUrl: "/images/forum-thread.jpg",
        stats: { views: thread._count.views, comments: thread._count.posts - 1 },
        // Browse mode only ever shows this for a reply-bumped thread
        // (unchanged); search mode always shows *some* post preview, since
        // there's now a real excerptPost to source it from regardless of
        // whether the thread was freshly created or bumped.
        replyExcerpt: query ? (excerptPost ? excerptOf(excerptPost.body) : undefined) : isReply && latestPost ? excerptOf(latestPost.body) : undefined,
      };
    }),
    ...announcements.map((announcement): FeedItem => ({
      type: "announcement",
      id: announcement.id,
      title: announcement.title,
      excerpt: excerptOf(announcement.body),
      href: query
        ? `/whats-new/announcements/${announcement.id}?q=${encodeURIComponent(query)}`
        : `/whats-new/announcements/${announcement.id}`,
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
      excerpt: survey.description ? excerptOf(survey.description) : "Share your feedback.",
      href: withFeedRef(`/surveys/${survey.id}`, query),
      // openedAt is never null here — the where clause above filters to status: open.
      timestamp: (survey.openedAt as Date).toISOString(),
      author: BOARD_SENDER,
      imageUrl: getSurveyHeroImageUrl(survey.heroImageUrl),
    })),
    ...seekingReviewItems.map((item): FeedItem => {
      const isSubmitter = viewerId != null && item.submitterId === viewerId;
      // Search mode: a hit here can be a comment match with nothing in
      // `description` to excerpt (see the `comments` select above) — only
      // reach for a comment once the description itself doesn't contain the
      // match, so a real description match is never displaced by one.
      const matchingComment =
        query && !textContainsMatch(item.description, query)
          ? item.comments.find((comment) => textContainsMatch(comment.body, query))
          : undefined;
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
            : matchingComment
              ? excerptOf(matchingComment.body)
              : excerptOf(item.description),
        href: withFeedRef(`/review-feedback/${item.id}`, query),
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
    ...inboxItems,
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const hasMore = merged.length > pageSize;
  const items = merged.slice(0, pageSize);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? { ts: last.timestamp, id: last.id } : null;

  // Total match count for the page title ("N search results for ...") —
  // summed from each domain's Meilisearch hit count (already computed
  // above, before any Prisma query ran), not the length of `items`, which
  // is capped at pageSize. `wants()`-excluded domains already contribute an
  // empty hits array, so this naturally reflects the active type-filter
  // pill without any extra branching here. This is a Meilisearch-hit count,
  // not a Prisma-visibility-exact one — a restricted item the viewer can't
  // actually see could inflate it slightly; deliberately not worth a full
  // parallel count() per domain (several of which layer JS-side filtering
  // Prisma can't express, e.g. isThreadVisible/matchesInboxSearch) for a
  // number whose whole job is a rough "about this many" in a page heading.
  const totalCount = query
    ? (eventHitIds?.length ?? 0) +
      (libraryHitIds?.length ?? 0) +
      (forumHitIds?.length ?? 0) +
      (announcementHitIds?.length ?? 0) +
      (surveyHitIds?.length ?? 0) +
      (reviewHitIds?.length ?? 0) +
      matchedInboxRaw.length
    : undefined;

  return { items, nextCursor, hasMore, totalCount };
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
