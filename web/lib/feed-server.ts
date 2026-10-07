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
import { withFeedRef, type FeedItem, type FeedItemType, type FeedCursor } from "@/lib/feed";
import { firstForumPostImageUrl, stripPastedImageTokens } from "@/lib/pasted-images";
import { extractSnippet, textContainsMatch } from "@/lib/text-highlight";
import { firstYoutubeUrlInText, youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";
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
import { formatEventDateTime } from "@/lib/format-date";
import { communityVisibilityWhere, getMemberCommunityContext } from "@/lib/events-server";
import { getInboxList } from "@/lib/inbox-server";
import { matchesInboxSearch } from "@/lib/inbox";
import { digestContentOf, type DigestContent } from "@/lib/weekly-digest-compose";

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
  id: true,
  name: true,
  profile: { select: { avatarUrl: true, titleSpecialty: true, countryRegion: true, showSpecialtyLocation: true } },
} as const;

function truncate(text: string, maxLength = EXCERPT_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function authorOf(user: {
  id: string;
  name: string | null;
  profile: { avatarUrl: string | null; titleSpecialty: string | null; countryRegion: string | null; showSpecialtyLocation: boolean } | null;
}) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: getProfileAvatarUrl(user.profile?.avatarUrl ?? null),
    // Same showSpecialtyLocation enforcement as the Directory (lib/members-server.ts).
    titleSpecialty: user.profile?.showSpecialtyLocation ? user.profile.titleSpecialty : null,
    countryRegion: user.profile?.showSpecialtyLocation ? user.profile.countryRegion : null,
  };
}

// An event's/Library item's discussion thread, as its parent's feed row
// needs it: the reply count (posts includes the auto-created opening post)
// plus the newest post, to credit and quote the latest replier when the
// parent was bumped by discussion activity.
const DISCUSSION_THREAD_FEED_SELECT = {
  id: true,
  _count: { select: { posts: true } },
  posts: {
    select: { id: true, author: { select: AUTHOR_SELECT }, body: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
} as const;

type DiscussionThreadForFeed = {
  id: string;
  _count: { posts: number };
  posts: { id: string; author: Parameters<typeof authorOf>[0]; body: string }[];
} | null;

/**
 * The latest reply that bumped an event/Library item's feed row, or null
 * when the row sits at its original position (lastActivityAt still equals
 * `baseTime`, or the thread holds only its auto-created opening post).
 */
function latestDiscussionReply(thread: DiscussionThreadForFeed, lastActivityAt: Date, baseTime: Date) {
  if (!thread || thread._count.posts < 2 || lastActivityAt.getTime() <= baseTime.getTime()) return null;
  return thread.posts[0] ?? null;
}

// Every admin-broadcast content type (Board Announcements, Surveys)
// deliberately masks the sending admin behind a fixed institutional
// identity on every member-facing surface (feed row, detail page, email) —
// the real sender (Announcement.authorId / Survey.authorId) is only ever
// shown unmasked in the admin history list (lib/announcements-server.ts,
// lib/surveys-server.ts).
const BOARD_SENDER = {
  id: null,
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
  /**
   * Community-based-categorization initiative, objective 2's "Search only
   * my communities" checkbox. Only the Library domain (KnowledgeItem, via
   * KnowledgeCategory.communityId) can actually be scoped by this today —
   * Events/Forum/Announcements/Survey/ReviewItem don't carry community tags
   * yet (later objectives in the same initiative), so they're deliberately
   * left unfiltered here rather than made to disappear entirely, matching
   * the "untagged content stays universal" rule those objectives use
   * elsewhere. Omit/undefined to leave every domain unfiltered.
   */
  communityIds?: string[];
  /**
   * What's New's "Following" pane: restrict the feed to items whose own
   * author/host/contributor/submitter is one of these members (events by
   * host, library by contributor, forum threads by starter, peer review by
   * submitter). Layered on top of — never instead of — each domain's
   * per-viewer visibility where-clause, so following can't surface anything
   * the viewer couldn't already see. Announcements/Surveys (anonymous Board
   * sender) and Inbox are never included, and discussion-reply "bump" rows
   * are suppressed so every row is genuinely by a followed member. Intended
   * for browse mode (no `q`); omit/undefined for the ordinary feed.
   */
  authorIds?: string[];
}): Promise<{
  items: FeedItem[];
  nextCursor: FeedCursor | null;
  hasMore: boolean;
  totalCount?: number;
  countsByType?: Partial<Record<FeedItemType, number>>;
}> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const before = params.cursor ? new Date(params.cursor.ts) : null;
  const authorIds = params.authorIds;
  const wants = (type: FeedItem["type"]) =>
    (!params.types || params.types.includes(type)) &&
    // Following mode: only domains with a real, followable member author.
    !(authorIds && (type === "announcement" || type === "survey" || type === "inbox"));
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
  // Admin/moderator "can view anything" bypass, search-mode only.
  // Deliberately NOT extended to ordinary browsing: an admin's feed should
  // still only show their own new/relevant activity, not every restricted
  // item in the app.
  //
  // NOT implemented as an extra `{}` member appended to each domain's
  // visibility OR array below (the original approach, and what every
  // domain's comments used to describe) — confirmed via a standalone
  // Prisma script that an OR array containing a literal empty object
  // matches ZERO rows, not every row: `db.knowledgeItem.count({ where: {
  // OR: [{}] } })` returned 0 against a table with 19 rows, both for
  // count() and findMany(). That means this "bypass" silently matched
  // nothing since it was written — an admin/moderator's search never
  // actually surfaced restricted content their role should grant access
  // to. Fixed by omitting the restrictive OR clause entirely when the
  // bypass applies, via isPrivilegedSearchBypass below, instead of trying
  // to construct an always-true OR member.
  const isPrivilegedSearchBypass = Boolean(query && isPrivileged);

  // null = search inactive, no id filter applied to that domain; [] = search
  // active but zero Meilisearch hits, so the domain's query below should
  // deliberately match nothing rather than falling through to the unfiltered
  // browse behavior. Deliberately NOT gated on wants(type) here (unlike the
  // findMany calls below, which still are) — countsByType/totalCount need
  // every domain's hit count regardless of the active type-filter pill, or
  // selecting one pill would make every other type's count collapse to 0
  // and vanish from the pill row, leaving no way back except "All".
  const [eventHitIds, libraryHitIds, forumHitIds, announcementHitIds, surveyHitIds, reviewHitIds] = !query
    ? [null, null, null, null, null, null]
    : await Promise.all([
        searchEventDocuments(query).then((hits) => hits.map((hit) => hit.id)),
        searchLibraryDocuments(query).then((hits) => hits.map((hit) => hit.id)),
        searchForumDocuments(query).then((hits) => hits.map((hit) => hit.id)),
        searchAnnouncementDocuments(query).then((hits) => hits.map((hit) => hit.id)),
        searchSurveyDocuments(query).then((hits) => hits.map((hit) => hit.id)),
        searchReviewItemDocuments(query).then((hits) => hits.map((hit) => hit.id)),
      ]);

  // Community-based-categorization initiative, objective 5's access-control
  // change: `visibility: community` no longer means "every member" once an
  // event is tagged — functionally the same "is this event visible to this
  // viewer" gate events-server.ts's read paths apply, just re-derived here
  // (this feed query is Prisma-native, not a call through those functions).
  // Skipped when isPrivilegedSearchBypass already omits the whole OR clause
  // below.
  const eventMember = isPrivilegedSearchBypass ? null : await getMemberCommunityContext(viewerId);
  // Community-based-categorization initiative, objective 6 — same idea as
  // eventMember above, for isThreadVisible's new isForumAccessibleToMember
  // check (a thread posted in one of the community-linked forums). Unlike
  // eventMember this isn't gated on isPrivilegedSearchBypass: forum threads'
  // visibility filter runs post-fetch (isThreadVisible below), not as a
  // where-clause OR member the bypass needs to omit for query efficiency.
  const forumMember = await getMemberCommunityContext(viewerId);

  // Extracted so each domain's count() below (for countsByType/totalCount)
  // shares the exact same where clause its findMany uses, rather than
  // drifting out of sync with it over time.
  const eventWhere = {
    // publishedAt, not lastActivityAt — same fix as libraryWhere below (see
    // its own comment for the full rationale): an event's own feed row
    // never gets bumped by discussion activity, only by a Steward
    // publishing it (see the events.flatMap branch below, which surfaces a
    // reply as its own separate row instead of mutating this one). Also
    // excludes an in-progress "Save as Draft" event (publishedAt: null)
    // from the feed entirely — every other events-server.ts read path
    // already gates on this same `not: null`, an invariant this where
    // clause had been missing.
    publishedAt: before ? { not: null, lt: before } : { not: null },
    ...(eventHitIds ? { id: { in: eventHitIds } } : {}),
    ...(authorIds
      ? { AND: [{ OR: [{ hostId: { in: authorIds } }, { forumThread: { posts: { some: { authorId: { in: authorIds } } } } }] }] }
      : {}),
    cancelledAt: null,
    // A suspended member can't log in at all (lib/auth.ts), so they're never
    // `viewerId` here — this is unconditionally safe, same convention as
    // the Directory (lib/members-server.ts) and the profile search index
    // (lib/search-index-sync.ts).
    host: { suspended: false },
    // Omitted entirely (not just an always-true OR member) when
    // isPrivilegedSearchBypass — see its own comment above for why.
    ...(isPrivilegedSearchBypass
      ? {}
      : {
          OR: [
            { visibility: EventVisibility.community, ...communityVisibilityWhere(eventMember) },
            ...(viewerId
              ? [
                  { invitees: { some: { userId: viewerId } } },
                  { rsvps: { some: { userId: viewerId, status: RSVPStatus.going } } },
                ]
              : []),
            ...ownerBypass(viewerId ? { hostId: viewerId } : null),
          ],
        }),
  };
  const libraryWhere = {
    // Ordinary browse only ever shows `published` — a `flagged` item
    // shouldn't read as "fresh" activity while under moderation review even
    // though it's still reachable via its own existing links. In search
    // mode, widen to match syncKnowledgeItemToIndex's own index-eligibility
    // (published or flagged) — the old header search found flagged items
    // too, and this is a deliberate "find anything you can view" tool, not
    // a "what's new" one.
    status: query ? { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] } : KnowledgeStatus.published,
    // publishedAt, not lastActivityAt — unlike events/forum threads, a
    // library item's own feed row never gets bumped by discussion activity
    // (see the libraryItems.flatMap branch below, which surfaces a reply as
    // its own separate row instead of mutating this one). publishedAt is
    // always set once status is published/flagged (the only statuses this
    // where clause ever matches), so there's no need for a createdAt
    // fallback here.
    ...(before ? { publishedAt: { lt: before } } : {}),
    ...(libraryHitIds ? { id: { in: libraryHitIds } } : {}),
    ...(authorIds
      ? { AND: [{ OR: [{ contributorId: { in: authorIds } }, { forumThread: { posts: { some: { authorId: { in: authorIds } } } } }] }] }
      : {}),
    // Queries the direct KnowledgeItemCommunity relation, same as
    // getLibraryCards' communityFilter (lib/library-server.ts) — deriving
    // the community through `categories` instead made an item tagged with a
    // community but zero categories (categories became optional in the
    // standardization objective) invisible to this filter.
    ...(params.communityIds?.length
      ? { communities: { some: { communityId: { in: params.communityIds } } } }
      : {}),
    // Same suspended-author exclusion as eventWhere above.
    contributor: { suspended: false },
    // Same restricted-audience shape as eventWhere above (Objective 04's
    // read-path filter, mirrored here): a restricted item reaches an
    // invited member's feed, and its own contributor's. Omitted entirely
    // when isPrivilegedSearchBypass, same as eventWhere.
    ...(isPrivilegedSearchBypass
      ? {}
      : {
          OR: [
            { visibility: KnowledgeVisibility.public },
            ...(viewerId ? [{ invitees: { some: { userId: viewerId } } }] : []),
            ...ownerBypass(viewerId ? { contributorId: viewerId } : null),
          ],
        }),
  };
  // eventId: null/knowledgeItemId: null excludes the Events forum's
  // auto-created threads and the Library's on-demand discussion threads
  // during ordinary browse (see the findMany call below for the full
  // rationale). NOTE for countsByType/totalCount below: this where clause
  // is NOT the full visibility check for a forum thread — isThreadVisible
  // (applied as a JS filter after the findMany, since it also needs a
  // thread's inherited event/library visibility) can still exclude a
  // thread this where clause matches. db.forumThread.count(forumWhere)
  // is therefore a slight over-count for this one domain, not exact like
  // the others below — an accepted residual gap, not worth replicating
  // isThreadVisible's logic in SQL for a page-heading number.
  const forumWhere = {
    // Unconditional — deleteForumThread's soft-delete hides a thread from
    // every viewer (isThreadVisible's rule), so it shouldn't count here
    // either, unlike the restricted-visibility gates below which stay
    // approximate/over-counting per the note above.
    removed: false,
    ...(query ? {} : { eventId: null, knowledgeItemId: null }),
    // lastActivityAt (bumped by every new reply, see createForumPost) is
    // the sort/cursor field here rather than createdAt, so a thread with
    // fresh activity resurfaces near the top instead of only ever
    // appearing once at its original creation time.
    // Browse/following mode keys off createdAt instead (like libraryWhere's
    // publishedAt): a thread's own row never gets bumped by replies, which
    // surface as a separate row (see the forumThreads.flatMap branch below).
    // Search mode keeps lastActivityAt so a hit still lands on the post that
    // matched, via the single bumped row.
    ...(before ? (query ? { lastActivityAt: { lt: before } } : { createdAt: { lt: before } }) : {}),
    ...(forumHitIds ? { id: { in: forumHitIds } } : {}),
    ...(authorIds
      ? { AND: [{ OR: [{ authorId: { in: authorIds } }, { posts: { some: { authorId: { in: authorIds } } } }] }] }
      : {}),
    // Same suspended-author exclusion as eventWhere above — the thread's
    // own starter, not whoever posted the latest reply (a suspended
    // member's individual replies within an otherwise-live thread are a
    // separate, unhandled edge case, not what was reported).
    author: { suspended: false },
    // Member-Initiated Restricted Forum Threads' (§4.13/§11.16) own
    // per-viewer visibility filter — same shape as eventWhere/libraryWhere
    // above, since a standalone thread can independently carry
    // `visibility: invited`. Omitted entirely when isPrivilegedSearchBypass,
    // same as eventWhere/libraryWhere.
    ...(isPrivilegedSearchBypass
      ? {}
      : {
          OR: [
            { visibility: ForumThreadVisibility.community },
            ...(viewerId ? [{ invitees: { some: { userId: viewerId } } }] : []),
            ...ownerBypass(viewerId ? { authorId: viewerId } : null),
          ],
        }),
  };
  // eventWhere minus its publishedAt cursor (keeping `not: null` — drafts
  // stay out), re-keyed to lastActivityAt / rescheduledAt for the reply-row
  // and rescheduled-row fetches (see the event findMany above).
  const eventWhereWithoutCursor = { ...eventWhere, publishedAt: { not: null } };
  const eventReplyWhere = {
    ...eventWhereWithoutCursor,
    ...(before ? { lastActivityAt: { lt: before } } : {}),
  } as typeof eventWhere;
  const eventRescheduledWhere = {
    ...eventWhereWithoutCursor,
    // Only an upcoming event gets a "Rescheduled" row (see the events.flatMap branch).
    startsAt: { gt: new Date() },
    rescheduledAt: before ? { not: null, lt: before } : { not: null },
  } as typeof eventWhere;

  // libraryWhere minus its publishedAt cursor, re-keyed to lastActivityAt —
  // the reply-row fetch (see the library findMany above).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { publishedAt: _publishedAtCursor, ...libraryWhereWithoutCursor } = libraryWhere as typeof libraryWhere & { publishedAt?: unknown };
  const libraryReplyWhere = {
    ...libraryWhereWithoutCursor,
    ...(before ? { lastActivityAt: { lt: before } } : {}),
  } as typeof libraryWhere;

  // forumWhere minus its createdAt cursor, re-keyed to lastActivityAt — the
  // reply-row fetch (see the forum_thread findMany below).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdAt: _createdAtCursor, ...forumWhereWithoutCursor } = forumWhere as typeof forumWhere & { createdAt?: unknown };
  const forumReplyWhere = {
    ...forumWhereWithoutCursor,
    ...(before ? { lastActivityAt: { lt: before } } : {}),
  } as typeof forumWhere;
  const announcementWhere = {
    sentAt: { not: null },
    retractedAt: null,
    showInFeed: true,
    ...(before ? { sentAt: { lt: before } } : {}),
    ...(announcementHitIds ? { id: { in: announcementHitIds } } : {}),
  };
  const surveyWhere = {
    // Ordinary browse only shows `open` — nothing actionable about a closed
    // survey on the "what's new" feed. In search mode, widen to match
    // syncSurveyToIndex's own index-eligibility (open or closed — no
    // per-member visibility gate exists for Survey either way) — the old
    // header search could find a closed survey too.
    status: query ? { in: [SurveyStatus.open, SurveyStatus.closed] } : SurveyStatus.open,
    audienceMembers: true,
    ...(before ? { openedAt: { lt: before } } : {}),
    ...(surveyHitIds ? { id: { in: surveyHitIds } } : {}),
  };
  const reviewWhere = {
    // lastActivityAt (bumped by toggleSeekingReviewers whenever the
    // audience changes, see review-server.ts) is the sort/cursor field here
    // rather than createdAt, so an item whose audience was just
    // opened/closed resurfaces near the top — same convention as forumWhere
    // keying off its own lastActivityAt.
    ...(before ? { lastActivityAt: { lt: before } } : {}),
    ...(reviewHitIds ? { id: { in: reviewHitIds } } : {}),
    ...(authorIds ? { submitterId: { in: authorIds } } : {}),
    // Same suspended-author exclusion as eventWhere above.
    submitter: { suspended: false },
    // Omitted entirely when isPrivilegedSearchBypass, same as
    // eventWhere/libraryWhere/forumWhere above.
    ...(isPrivilegedSearchBypass
      ? {}
      : {
          OR: [
            // Ordinary browse eligibility, unchanged: open-call items are
            // public to every member; invite-only items only ever reach the
            // submitter or an invited reviewer's own feed, never a
            // bystander's.
            {
              status: ReviewItemStatus.open,
              OR: [
                { seekingReviewers: true },
                ...(viewerId ? [{ submitterId: viewerId }, { invitees: { some: { userId: viewerId } } }] : []),
              ],
            },
            // Search-mode-only: the submitter/invitee "can view this at
            // all" bypass canViewReviewItem already grants elsewhere,
            // extended to a closed item too — the old header search could
            // find a closed submission for its owner, this restores that.
            ...(query && viewerId
              ? [{ submitterId: viewerId }, { invitees: { some: { userId: viewerId } } }]
              : []),
          ],
        }),
  };

  // Run alongside countsPromise below (not sequentially after) — both are
  // independent, so awaiting them together via Promise.all(itemsPromise,
  // countsPromise) halves the added latency of the extra count queries.
  const fetchEvents = (
    where: typeof eventWhere,
    orderBy: { publishedAt: "desc" } | { lastActivityAt: "desc" } | { rescheduledAt: "desc" },
  ) =>
    db.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        publishedAt: true,
        startsAt: true,
        timezone: true,
        rescheduledAt: true,
        heroImageUrl: true,
        visibility: true,
        hostId: true,
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
        // Also feeds latestDiscussionReply below: a real reply still gets
        // its own feed row, just a separate one (see the events.flatMap
        // branch below) instead of overwriting this event's own row.
        forumThread: { select: DISCUSSION_THREAD_FEED_SELECT },
        lastActivityAt: true,
        // Whether the viewer themself RSVP'd going — gates the discussion
        // reply row below (attendees and invitees get event discussion activity).
        rsvps: { where: { userId: viewerId ?? "", status: RSVPStatus.going }, select: { id: true }, take: 1 },
        invitees: { where: { userId: viewerId ?? "" }, select: { id: true }, take: 1 },
      },
      orderBy,
      take: pageSize,
    });

  const fetchLibraryItems = (
    where: typeof libraryWhere,
    orderBy: { publishedAt: "desc" } | { lastActivityAt: "desc" },
  ) =>
    db.knowledgeItem.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        publishedAt: true,
        youtubeUrl: true,
        heroImageUrl: true,
        showTitleOverlay: true,
        visibility: true,
        contributorId: true,
        contributor: { select: AUTHOR_SELECT },
        _count: { select: { views: true } },
        // posts includes the thread's own system-authored opening post, so
        // forumReplyCount below subtracts one — same convention as the
        // events branch above. Also feeds latestDiscussionReply below: a
        // real reply still gets its own feed row, just a separate one
        // (see the libraryItems.flatMap branch below) instead of
        // overwriting this item's own row.
        forumThread: { select: DISCUSSION_THREAD_FEED_SELECT },
        lastActivityAt: true,
      },
      orderBy,
      take: pageSize,
    });

    const fetchForumThreads = (
    where: typeof forumWhere,
    orderBy: { lastActivityAt: "desc" } | { createdAt: "desc" },
  ) =>
    db.forumThread.findMany({
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
      where,
      select: {
        id: true,
        title: true,
        createdAt: true,
        lastActivityAt: true,
        author: { select: AUTHOR_SELECT },
        forum: { select: { name: true, slug: true, category: { select: { communityId: true } } } },
        // Latest post's author + body — a bump from a reply should credit
        // the replier (not the thread creator) and show what they wrote.
        // Falls back to `author` above when the thread has no posts yet.
        posts: {
          select: { id: true, author: { select: AUTHOR_SELECT }, body: true },
          orderBy: { createdAt: "desc" },
          take: query ? SEARCH_POST_SCAN_LIMIT : 1,
        },
        // posts includes the thread's own opening post, so replyCount below
        // subtracts one — same convention as toThreadListItem in forums-server.ts.
        _count: { select: { posts: true, views: true } },
        // Only needed for the isThreadVisible filter below — never rendered.
        // (removed is already excluded by forumWhere above; selected only
        // to satisfy isThreadVisible's OwnThreadAccess type.)
        visibility: true,
        authorId: true,
        removed: true,
        invitees: { select: { userId: true } },
        event: EVENT_THREAD_ACCESS_SELECT,
        knowledgeItem: KNOWLEDGE_ITEM_THREAD_ACCESS_SELECT,
      },
      orderBy,
      take: pageSize,
    }).then((threads) => threads.filter((thread) => isThreadVisible(thread, viewerId ?? undefined, isPrivileged, forumMember)));

  const itemsPromise = Promise.all([
    !wants("event") || eventHitIds?.length === 0 ? Promise.resolve([]) : query
      ? fetchEvents(eventWhere, { publishedAt: "desc" })
      // Browse/following: events are found three ways — by publishedAt for
      // their own rows, by lastActivityAt for reply rows, and by
      // rescheduledAt for "Rescheduled" rows (a reschedule doesn't bump
      // lastActivityAt) — so a reply or reschedule on an old event still
      // surfaces at the top. Same merge as library/forumThreads; the
      // events.flatMap branch only emits whichever row's own timestamp
      // falls inside the page's cursor window.
      : Promise.all([
          fetchEvents(eventWhere, { publishedAt: "desc" }),
          fetchEvents(eventReplyWhere, { lastActivityAt: "desc" }),
          fetchEvents(eventRescheduledWhere, { rescheduledAt: "desc" }),
        ]).then((sets) => {
          const seen = new Set<string>();
          return sets.flat().filter((event) => !seen.has(event.id) && !!seen.add(event.id));
        }),
    !wants("library") || libraryHitIds?.length === 0 ? Promise.resolve([]) : query
      ? fetchLibraryItems(libraryWhere, { publishedAt: "desc" })
      // Browse/following: items are found twice — by publishedAt for their
      // own rows, and by lastActivityAt for the reply rows of items too old
      // to be in the first set. Same merge as forumThreads below; the
      // libraryItems.flatMap branch only emits whichever row's own
      // timestamp falls inside the page's cursor window.
      : Promise.all([
          fetchLibraryItems(libraryWhere, { publishedAt: "desc" }),
          fetchLibraryItems(libraryReplyWhere, { lastActivityAt: "desc" }),
        ]).then(([byPublished, byActivity]) => {
          const seen = new Set(byPublished.map((item) => item.id));
          return [...byPublished, ...byActivity.filter((item) => !seen.has(item.id))];
        }),
    !wants("forum_thread") || forumHitIds?.length === 0 ? Promise.resolve([]) : query
      ? fetchForumThreads(forumWhere, { lastActivityAt: "desc" })
      // Browse/following: threads are found twice — by createdAt for their
      // own "New thread" rows, and by lastActivityAt for the reply rows of
      // threads too old to be in the first set (a reply to a month-old
      // thread must still surface at the top). Merged by id; the
      // forumThreads.flatMap branch below only emits whichever row's own
      // timestamp falls inside the page's cursor window.
      : Promise.all([
          fetchForumThreads(forumWhere, { createdAt: "desc" }),
          fetchForumThreads(forumReplyWhere, { lastActivityAt: "desc" }),
        ]).then(([byCreated, byActivity]) => {
          const seen = new Set(byCreated.map((thread) => thread.id));
          return [...byCreated, ...byActivity.filter((thread) => !seen.has(thread.id))];
        }),
    !wants("announcement") || announcementHitIds?.length === 0 ? Promise.resolve([]) : db.announcement.findMany({
      where: announcementWhere,
      select: { id: true, title: true, body: true, heroImageUrl: true, sentAt: true, welcomeTier: true, digestPeriodEnd: true, digestContent: true },
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
      where: surveyWhere,
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
      where: reviewWhere,
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
    // Deliberately NOT gated on wants("inbox") either, same reason as the
    // hitIds block above — matchedInboxRaw below feeds countsByType.inbox,
    // which needs the real count regardless of the active type-filter pill.
    !query || !viewerId ? Promise.resolve([]) : getInboxList(viewerId),
  ]);

  // Accurate, permission-filtered counts for countsByType/totalCount below
  // — deliberately real count() calls against each domain's exact where
  // clause (shared with the findMany calls above via the *Where consts),
  // not the raw Meilisearch hit-id length: a hit the viewer isn't actually
  // authorized to see (restricted/invited content) would otherwise inflate
  // the count while the rendered list stays empty for them. Skips the
  // query entirely (0, no DB round-trip) whenever that domain's hit list is
  // already empty. Unconditional on wants(type), same reason as the hitIds
  // block above — every type's count is needed regardless of which filter
  // pill is currently active, not just the one being fetched in full.
  const countsPromise = !query
    ? Promise.resolve([0, 0, 0, 0, 0, 0] as const)
    : Promise.all([
        eventHitIds?.length === 0 ? 0 : db.event.count({ where: eventWhere }),
        libraryHitIds?.length === 0 ? 0 : db.knowledgeItem.count({ where: libraryWhere }),
        forumHitIds?.length === 0 ? 0 : db.forumThread.count({ where: forumWhere }),
        announcementHitIds?.length === 0 ? 0 : db.announcement.count({ where: announcementWhere }),
        surveyHitIds?.length === 0 ? 0 : db.survey.count({ where: surveyWhere }),
        reviewHitIds?.length === 0 ? 0 : db.reviewItem.count({ where: reviewWhere }),
      ]);

  const [
    [events, libraryItems, forumThreads, announcements, surveys, seekingReviewItems, inboxRaw],
    [eventCount, libraryCount, forumCount, announcementCount, surveyCount, reviewCount],
  ] = await Promise.all([itemsPromise, countsPromise]);

  // Each browsed/followed thread's opening post, for the thread's own
  // "New thread" row — the `posts` select above is newest-first (take: 1),
  // which is the reply, not the opening post, once a thread has replies.
  const openingPostByThread = new Map<string, { id: string; body: string }>();
  if (!query && forumThreads.length > 0) {
    const openingPosts = await db.forumPost.findMany({
      where: { threadId: { in: forumThreads.map((thread) => thread.id) } },
      select: { id: true, threadId: true, body: true },
      orderBy: { createdAt: "asc" },
      distinct: ["threadId"],
    });
    for (const post of openingPosts) openingPostByThread.set(post.threadId, post);
  }

  // Following mode: the newest non-removed post by a followed member in each
  // event/library discussion thread and standalone forum thread, flagged as a
  // real reply (vs. the thread's opening post — auto-created for event/library
  // discussions, the starter's own post for a standalone thread). One batched
  // pair of queries rather than reshaping every domain's `posts` select.
  const followedAuthorSet = new Set(authorIds ?? []);
  const followedPostByThread = new Map<
    string,
    { post: { id: string; body: string; author: Parameters<typeof authorOf>[0] }; isReply: boolean }
  >();
  if (authorIds) {
    const threadIds = [
      ...events.flatMap((event) => (event.forumThread ? [event.forumThread.id] : [])),
      ...libraryItems.flatMap((item) => (item.forumThread ? [item.forumThread.id] : [])),
      ...forumThreads.map((thread) => thread.id),
    ];
    if (threadIds.length > 0) {
      const [followedPosts, openings] = await Promise.all([
        db.forumPost.findMany({
          where: { threadId: { in: threadIds }, authorId: { in: authorIds }, removed: false },
          select: { id: true, threadId: true, body: true, createdAt: true, author: { select: AUTHOR_SELECT } },
          orderBy: { createdAt: "desc" },
        }),
        db.forumPost.groupBy({ by: ["threadId"], where: { threadId: { in: threadIds } }, _min: { createdAt: true } }),
      ]);
      const openingAt = new Map(openings.map((row) => [row.threadId, row._min.createdAt]));
      for (const post of followedPosts) {
        if (followedPostByThread.has(post.threadId)) continue; // newest first — keep the first seen
        const opening = openingAt.get(post.threadId);
        followedPostByThread.set(post.threadId, {
          post,
          isReply: !!opening && post.createdAt.getTime() > opening.getTime(),
        });
      }
    }
  }

  // getInboxList has no cursor/take support (it's a full, already-sorted
  // fetch of one member's own mailbox), so search-match, `before`-cursor
  // filtering, and the pageSize bound every other domain gets from Prisma
  // are all applied here in JS instead. No re-sort needed — getInboxList
  // already returns items sorted desc by lastActivityAt, and filtering
  // preserves that order.
  // Shared with totalCount below (see there for why this is computed
  // unsliced/uncursored) rather than re-filtering inboxRaw twice.
  const matchedInboxRaw = query ? inboxRaw.filter((item) => matchesInboxSearch(item, query.toLowerCase())) : [];

  const inboxItems: FeedItem[] = !query || !wants("inbox")
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
              id: item.otherPartyId,
              name: item.otherPartyName,
              avatarUrl: item.otherPartyAvatarUrl,
              titleSpecialty: null,
              countryRegion: null,
            },
            imageUrl: null,
          };
          if (item.kind === "message") {
            // item.snippet is always just the latest message's preview —
            // wrong once the actual match (matchesInboxSearch checked
            // item.searchText, every message in the thread concatenated) is
            // in an earlier message than that. This block only ever runs
            // in search mode (see the !query guard above matchedInboxRaw),
            // so excerptOf(query-aware) is always the right call here, not
            // just a fallback.
            return {
              ...base,
              title: item.subject ?? `Message from ${item.otherPartyName}`,
              excerpt: excerptOf(item.searchText),
            };
          }
          // Same fix as the forum-thread branch above: prefer whichever
          // negotiation step actually contains the match over always the
          // latest, which might not be why this thread matched at all.
          const matchingMessage = item.messages.find(
            (message) => message.body && textContainsMatch(message.body, query),
          );
          const latestBody = [...item.messages].reverse().find((message) => message.body)?.body ?? null;
          const excerptSource = matchingMessage?.body ?? latestBody;
          return {
            ...base,
            title: `Meeting request: ${item.topic}`,
            excerpt: excerptSource ? excerptOf(excerptSource) : "View this meeting request.",
          };
        });

  const merged: FeedItem[] = [
    ...events.flatMap((event): FeedItem[] => {
      const ownRow: FeedItem = {
        type: "event",
        id: event.id,
        title: event.title,
        // Restricted events reach a viewer who is either the organizer
        // themselves (ownerBypass above) or an invited member — the RSVP
        // framing only makes sense for the latter, so it's skipped for the
        // organizer's own feed (viewerId === event.hostId), same rationale as
        // the peer_review branch's isSubmitter check below. Search mode is a
        // further exception: the RSVP framing carries no hint of why this
        // event matched the query, so a search hit shows the actual
        // (highlightable) description instead — the viewer is already
        // authorized to see it, same as clicking through would show them.
        //
        // Deliberately never swapped for a reply's excerpt/author — same
        // fix as the library branch below (see its own comment): a reply
        // shouldn't replace this row's own content or position (publishedAt,
        // not bumped by activity — see eventWhere). A reply still surfaces,
        // but as replyRow below, which always reflects just the latest
        // reply, not a growing trail of one row per historical reply.
        excerpt: event.visibility === EventVisibility.invited && !query && event.hostId !== viewerId
          ? `${event.host.name ?? "The host"} has requested your attendance. Please RSVP.`
          : event.description
            ? excerptOf(event.description)
            : "No description provided.",
        href: withFeedRef(`/calendar/${event.id}`, query),
        timestamp: (event.publishedAt ?? event.createdAt).toISOString(),
        author: authorOf(event.host),
        imageUrl: getEventHeroImageUrl(event.heroImageUrl),
        attendeeCount: event._count.rsvps + event._count.registrations,
        forumReplyCount: event.forumThread ? event.forumThread._count.posts - 1 : undefined,
        eventStartsAt: event.startsAt.toISOString(),
        eventViewCount: event._count.views,
        isRestricted: event.visibility === EventVisibility.invited,
      };

      // Search mode never bumps/adds a reply row here, same as before —
      // a search hit shows the event's own indexed description, not
      // discussion framing that carries no hint of why it matched the
      // query.
      const viewerAttends = event.rsvps.length > 0 || event.invitees.length > 0 || event.hostId === viewerId;
      // Following mode: the event's own row only when its host is followed;
      // the reply row is the newest reply by a followed member (same
      // attendee/invitee gate on discussion activity as the ordinary feed).
      // Each row only inside its own timestamp's cursor window — an event
      // fetched via another query (see events above) may have one row
      // already shown on an earlier page.
      const eventRows: FeedItem[] =
        (!authorIds || followedAuthorSet.has(event.hostId)) && (!before || (event.publishedAt ?? event.createdAt) < before)
          ? [ownRow]
          : [];
      const followedReply = authorIds && event.forumThread ? followedPostByThread.get(event.forumThread.id) : undefined;
      const reply = query || !viewerAttends
        ? null
        : authorIds
          ? (followedReply?.isReply ? followedReply.post : null)
          : latestDiscussionReply(event.forumThread, event.lastActivityAt, event.createdAt);
      // A reschedule of a still-upcoming event, as its own row (id prefixed
      // so it can't collide with the event's or a reply's) — same approach as
      // the reply row below: the event's own row keeps its publishedAt
      // position. Never in search mode; in following mode only when the host
      // is followed (same as the event's own row).
      const rescheduledRow: FeedItem | null =
        !query && event.rescheduledAt && event.startsAt.getTime() > Date.now() && (!authorIds || followedAuthorSet.has(event.hostId)) && (!before || event.rescheduledAt < before)
          ? {
              type: "event",
              id: `rescheduled-${event.id}`,
              title: event.title,
              excerpt: `Rescheduled to ${formatEventDateTime(event.startsAt, event.timezone)}`,
              href: withFeedRef(`/calendar/${event.id}`, query),
              timestamp: event.rescheduledAt.toISOString(),
              author: authorOf(event.host),
              imageUrl: null,
              eventStartsAt: event.startsAt.toISOString(),
              isRestricted: event.visibility === EventVisibility.invited,
            }
          : null;
      if (rescheduledRow) eventRows.push(rescheduledRow);
      if (!reply || (before && event.lastActivityAt >= before)) return eventRows;

      // The latest reply, as its own row (id: reply.id, not event.id)
      // rather than overwriting ownRow above — same fix as the library
      // branch below. Only ever one such row per event, standing in for
      // "this event's discussion has new activity", naturally replaced by
      // the next reply's row once it bumps lastActivityAt again.
      const replyRow: FeedItem = {
        type: "event",
        id: reply.id,
        title: event.title,
        excerpt: "Replied in the event discussion",
        // The event page embeds its discussion thread, so this links
        // straight to the reply (same #post-<id> anchor as forum_thread rows).
        href: withFeedRef(`/calendar/${event.id}`, query) + `#post-${reply.id}`,
        timestamp: event.lastActivityAt.toISOString(),
        author: authorOf(reply.author),
        replyExcerpt: excerptOf(stripPastedImageTokens(reply.body)) || undefined,
        // No hero banner here (same as the library branch below) — only
        // ownRow above carries the event's own hero image.
        imageUrl: null,
        isRestricted: event.visibility === EventVisibility.invited,
      };
      return [...eventRows, replyRow];
    }),
    ...libraryItems.flatMap((item): FeedItem[] => {
      const ownRow: FeedItem = {
        type: "library",
        id: item.id,
        title: item.title,
        // Restricted items reach a viewer who is either the contributor
        // themselves (ownerBypass above) or an invited member — the "shared
        // with you" framing only makes sense for the latter, so it's skipped
        // for the contributor's own feed (viewerId === item.contributorId),
        // same rationale as the events branch's excerpt swap. Search mode
        // exception: see the matching comment on the events branch above.
        //
        // Deliberately never swapped for a reply's excerpt/author, unlike
        // the events branch above — confirmed with user: a reply to a
        // Library item's discussion shouldn't replace this row's own
        // content or position (publishedAt, not bumped by activity — see
        // libraryWhere). A reply still surfaces, but as replyRow below,
        // which always reflects just the latest reply, not a growing trail
        // of one row per historical reply.
        excerpt: item.visibility === KnowledgeVisibility.restricted && !query && item.contributorId !== viewerId
          ? `${item.contributor.name ?? "A member"} shared this with you.`
          // Non-null assertion, not a fallback — the query above only ever
          // selects published/flagged items, which submit-time validation
          // guarantees a description for.
          : excerptOf(item.description!),
        href: withFeedRef(`/library/${item.id}`, query),
        timestamp: (item.publishedAt ?? item.createdAt).toISOString(),
        author: authorOf(item.contributor),
        // A custom hero image always wins; a recorded_lecture with none set
        // falls back to its video's YouTube thumbnail as the default cover —
        // same precedence as LibraryItemCard's browse-grid thumbnail.
        imageUrl: getKnowledgeItemHeroImageUrl(item.heroImageUrl) ?? (item.youtubeUrl ? youtubeThumbnailUrl(item.youtubeUrl) : null),
        // Always false when heroImageUrl is null (server-enforced at write
        // time), so this is never true for the YouTube-thumbnail fallback
        // above — only ever for a real uploaded hero image.
        showTitleOverlay: item.showTitleOverlay,
        youtubeEmbedUrl: !getKnowledgeItemHeroImageUrl(item.heroImageUrl) && item.youtubeUrl
          ? (youtubeEmbedUrl(item.youtubeUrl) ?? undefined)
          : undefined,
        isRestricted: item.visibility === KnowledgeVisibility.restricted,
        libraryViewCount: item._count.views,
        forumReplyCount: item.forumThread ? item.forumThread._count.posts - 1 : undefined,
      };

      // Search mode never bumps/adds a reply row here, same as the events
      // branch above — a search hit shows the item's own indexed
      // description, not discussion framing that carries no hint of why it
      // matched the query.
      // Following mode: same shape as the events branch above.
      // Each row only inside its own timestamp's cursor window — an item
      // fetched via the other query (see libraryItems above) may have one
      // row already shown on an earlier page.
      const libraryRows =
        (!authorIds || followedAuthorSet.has(item.contributorId)) && (!before || (item.publishedAt ?? item.createdAt) < before)
          ? [ownRow]
          : [];
      const followedReply = authorIds && item.forumThread ? followedPostByThread.get(item.forumThread.id) : undefined;
      const reply = query
        ? null
        : authorIds
          ? (followedReply?.isReply ? followedReply.post : null)
          : latestDiscussionReply(item.forumThread, item.lastActivityAt, item.publishedAt ?? item.createdAt);
      if (!reply || (before && item.lastActivityAt >= before)) return libraryRows;

      // The latest reply, as its OWN row (id: reply.id, not item.id) rather
      // than overwriting ownRow above — confirmed with user: a reply
      // shouldn't replace the original resource's feed entry. Also
      // confirmed NOT a full history of every past reply: only ever one
      // such row per item, standing in for "this item's discussion has new
      // activity" and naturally replaced by the next reply's row once it
      // bumps lastActivityAt again (same one-row-per-domain-entity
      // convention forumThreads' bumped rows already use below).
      const replyRow: FeedItem = {
        type: "library",
        id: reply.id,
        title: item.title,
        excerpt: "Replied in the resource discussion",
        href: withFeedRef(`/library/${item.id}`, query) + `#post-${reply.id}`,
        timestamp: item.lastActivityAt.toISOString(),
        author: authorOf(reply.author),
        replyExcerpt: excerptOf(stripPastedImageTokens(reply.body)) || undefined,
        // No hero banner here (confirmed with user) — unlike ownRow above,
        // which always carries the item's own hero/YouTube-thumbnail image.
        imageUrl: null,
        isRestricted: item.visibility === KnowledgeVisibility.restricted,
      };
      return [...libraryRows, replyRow];
    }),
    ...forumThreads
      .filter((thread) => !authorIds || followedPostByThread.has(thread.id))
      .flatMap((thread): FeedItem[] => {
      const followedPost = authorIds ? followedPostByThread.get(thread.id) : undefined;
      const latestPost = thread.posts[0];

      // `post` is whichever post the row previews. The row's own fields are
      // shared between the three shapes below (search hit, original thread,
      // reply) — only the post, framing, and timestamp differ.
      const buildRow = (
        id: string,
        post: { id: string; author: Parameters<typeof authorOf>[0]; body: string } | undefined,
        isReply: boolean,
        timestamp: Date,
      ): FeedItem => {
        const bodyImageUrl = firstForumPostImageUrl(post?.body);
        const youtubeLink = firstYoutubeUrlInText(post?.body);
        return {
          type: "forum_thread",
          id,
          title: thread.title,
          excerpt: isReply
            ? `Replied to a thread in ${thread.forum.name}`
            : `New thread in ${thread.forum.name}`,
          // A reply row links straight to the replying post (matching the
          // #post-<id> convention used by @-mention notifications, see
          // lib/forums-server.ts) instead of landing at the thread top.
          href:
            withFeedRef(`/forums/${thread.forum.slug}/${thread.id}`, query) +
            (isReply && post ? `#post-${post.id}` : ""),
          timestamp: timestamp.toISOString(),
          author: authorOf(post?.author ?? thread.author),
          // Forum threads have no per-thread hero image (no upload UI, no
          // schema column) — every thread shows the same static default so
          // the feed row still gets a thumbnail (see FeedRow's forum_thread
          // layout).
          imageUrl: "/images/forum-thread.jpg",
          stats: { views: thread._count.views, comments: thread._count.posts - 1 },
          // Strips any `![](url)` pasted-image token so the snippet shows
          // prose, not raw markdown (an image-only post strips to "" and the
          // row shows just bodyImageUrl below).
          replyExcerpt: post ? excerptOf(stripPastedImageTokens(post.body)) || undefined : undefined,
          // A pasted screenshot in the previewed post is surfaced inline
          // (FeedRow renders it full-width). The /api/forums/post-image
          // proxy re-checks thread visibility per request, so it's never
          // more visible than the thread.
          bodyImageUrl,
          // A YouTube link in that same post previews as an inline player —
          // but only when there's no pasted image, which wins the one slot.
          ...(!bodyImageUrl && youtubeLink
            ? {
                youtubeEmbedUrl: youtubeEmbedUrl(youtubeLink) ?? undefined,
                youtubeThumbnailUrl: youtubeThumbnailUrl(youtubeLink) ?? undefined,
              }
            : {}),
          isRestricted: thread.visibility === ForumThreadVisibility.invited,
          isReply,
        };
      };

      // Search mode: one row centred on whichever fetched post actually
      // contains the match, rather than always the latest — the latest
      // post might not be why this thread matched at all (see
      // SEARCH_POST_SCAN_LIMIT above). Framed "Replied" when it's bumped.
      if (query) {
        const matchingPost = thread.posts.find((post) => textContainsMatch(post.body, query));
        const isReply = thread.lastActivityAt.getTime() > thread.createdAt.getTime();
        return [buildRow(thread.id, matchingPost ?? latestPost, isReply, thread.lastActivityAt)];
      }

      // Browse/following mode, mirroring the Library branch above —
      // confirmed with user: a reply shouldn't replace the thread's own
      // feed entry. The thread's row stays at its createdAt with its opening
      // post; the latest reply surfaces as its OWN row (id: the reply's id)
      // at lastActivityAt, one per thread, replaced by the next reply's.
      const opening = openingPostByThread.get(thread.id);
      // Each row only inside its own timestamp's cursor window — a thread
      // fetched via the other query (see forumThreads above) may have one
      // row already shown on an earlier page.
      const ownRow = (!authorIds || followedAuthorSet.has(thread.authorId)) && (!before || thread.createdAt < before)
        ? [buildRow(thread.id, opening ? { ...opening, author: thread.author } : undefined, false, thread.createdAt)]
        : [];
      const reply = authorIds
        ? (followedPost?.isReply ? followedPost.post : null)
        : thread._count.posts >= 2 && thread.lastActivityAt.getTime() > thread.createdAt.getTime()
          ? (latestPost ?? null)
          : null;
      const replyInWindow = !before || thread.lastActivityAt < before;
      return reply && replyInWindow ? [...ownRow, buildRow(reply.id, reply, true, thread.lastActivityAt)] : ownRow;
    }),
    ...announcements.map((announcement): FeedItem => {
      // A weekly digest whose layout is intact leads with its one-line
      // headline numbers rather than the body's opening sentence; searching
      // still shows the matched snippet of the body.
      const digestSummary = digestContentOf(announcement.digestContent)?.summary;
      return {
      type: "announcement",
      id: announcement.id,
      title: announcement.title,
      ...(announcement.digestPeriodEnd ? { isDigest: true } : {}),
      // `[label](url)` links collapse to their label so the feed excerpt never shows raw markdown.
      excerpt:
        digestSummary && !query
          ? digestSummary
          : excerptOf(announcement.body.replace(/\[([^\]]+)\]\(https?:\/\/[^\s()]+\)/g, "$1")),
      href: query
        ? `/whats-new/announcements/${announcement.id}?q=${encodeURIComponent(query)}`
        : `/whats-new/announcements/${announcement.id}`,
      // sentAt is never null here — the where clause above excludes drafts.
      timestamp: (announcement.sentAt as Date).toISOString(),
      author: BOARD_SENDER,
      imageUrl: getAnnouncementHeroImageUrl(announcement.heroImageUrl),
      titleTier: announcement.welcomeTier,
      };
    }),
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
        // open-call item. Search mode exception: see the matching comment
        // on the events branch above — the invite line hides which comment
        // actually matched, so a search hit falls through to the same
        // matchingComment/description excerpt an open-call item gets.
        excerpt:
          !item.seekingReviewers && !isSubmitter && !query
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
  // summed from countsPromise's accurate, permission-filtered per-domain
  // counts (matchedInboxRaw.length for inbox, already exact — see there),
  // not the raw Meilisearch hit-id lengths and not the length of `items`,
  // which is capped at pageSize. `wants()`-excluded domains' counts are
  // still computed (see countsPromise above), so this naturally reflects
  // the active type-filter pill without any extra branching here.
  // Per-type breakdown of the same counts — lets the page hide a filter
  // pill entirely when its type has zero matches, rather than leaving it
  // clickable into a dead "nothing here" state.
  const countsByType: Partial<Record<FeedItemType, number>> | undefined = query
    ? {
        event: eventCount,
        library: libraryCount,
        forum_thread: forumCount,
        announcement: announcementCount,
        survey: surveyCount,
        peer_review: reviewCount,
        inbox: matchedInboxRaw.length,
      }
    : undefined;
  // Sums only the currently-wanted types, NOT every entry in countsByType —
  // that breakdown deliberately includes every type regardless of the
  // active filter pill (so other pills stay visible/accurate), but the
  // page-heading total must match what's actually on screen: with a
  // specific pill selected, a match in some other, undisplayed type must
  // not inflate this number.
  const totalCount = countsByType
    ? (Object.entries(countsByType) as [FeedItemType, number][])
        .filter(([type]) => wants(type))
        .reduce((sum, [, count]) => sum + count, 0)
    : undefined;

  return { items, nextCursor, hasMore, totalCount, countsByType };
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
  /** A weekly digest's structured layout, when it has one (and wasn't edited) — the detail page renders it instead of the plain body. */
  digest: DigestContent | null;
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
    select: { id: true, title: true, body: true, heroImageUrl: true, sentAt: true, retractedAt: true, welcomeTier: true, digestContent: true },
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
    digest: digestContentOf(announcement.digestContent),
  };
}
