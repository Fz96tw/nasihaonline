import "server-only";
import { db } from "@/lib/db";
import {
  searchProfileDocuments,
  searchLibraryDocuments,
  searchForumDocuments,
  searchEventDocuments,
  searchAnnouncementDocuments,
  searchSurveyDocuments,
  searchReviewItemDocuments,
} from "@/lib/meilisearch";
import { isThreadVisible } from "@/lib/forums-server";
import { canViewReviewItem, canPreviewReviewItem } from "@/lib/review-server";
import { DIRECTORY_TIERS } from "@/lib/members";
import { EventVisibility, KnowledgeStatus, KnowledgeVisibility, Role, SurveyStatus } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";

export type SearchResultType =
  | "profile"
  | "library"
  | "forum"
  | "event"
  | "announcement"
  | "survey"
  | "reviewItem";

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string | null;
  href: string;
};

const DEFAULT_LIMIT_PER_DOMAIN = 5;

/**
 * Fans out to all 7 domain-specific Meilisearch indexes in parallel, then
 * for each domain re-fetches the hit ids from Postgres with the *current
 * viewer's* access-control condition applied — the same authorization each
 * domain's own detail page/list query already enforces, not a weaker or
 * separately-maintained copy. A Meilisearch hit that fails this check is
 * silently dropped, never returned, regardless of how strong the text
 * match was. This is deliberately not a single unified index: see the
 * approved plan's rationale (mirrors the 3 pre-existing per-domain search
 * boxes, each domain's filterable fields genuinely differ, and the UI
 * groups by type anyway so there's no cross-type relevance ranking to lose).
 */
export async function searchAllDomains(
  query: string,
  viewer: UserModel,
  limitPerDomain: number = DEFAULT_LIMIT_PER_DOMAIN,
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const isPrivileged = viewer.role === Role.admin || viewer.role === Role.moderator;

  const [profiles, library, forums, events, announcements, surveys, reviewItems] = await Promise.all([
    searchProfiles(trimmed, limitPerDomain),
    searchLibrary(trimmed, viewer.id, isPrivileged, limitPerDomain),
    searchForums(trimmed, viewer.id, isPrivileged, limitPerDomain),
    searchEvents(trimmed, viewer.id, isPrivileged, limitPerDomain),
    searchAnnouncements(trimmed, limitPerDomain),
    searchSurveys(trimmed, limitPerDomain),
    searchReviewItems(trimmed, viewer, limitPerDomain),
  ]);

  return [...profiles, ...library, ...forums, ...events, ...announcements, ...surveys, ...reviewItems];
}

// Public to all members, viewer-independent (getDirectoryMemberById,
// lib/members-server.ts) — listInDirectory + tier is the whole gate.
async function searchProfiles(query: string, limit: number): Promise<SearchResult[]> {
  const hits = await searchProfileDocuments(query, limit);
  if (hits.length === 0) return [];

  const profiles = await db.profile.findMany({
    where: {
      userId: { in: hits.map((hit) => hit.id) },
      listInDirectory: true,
      user: { tier: { in: DIRECTORY_TIERS } },
    },
    select: { userId: true, user: { select: { name: true } } },
  });
  const byId = new Map(profiles.map((profile) => [profile.userId, profile]));

  return hits
    .map((hit) => byId.get(hit.id))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    .map((profile) => ({
      id: profile.userId,
      type: "profile" as const,
      title: profile.user.name ?? "A member",
      subtitle: "Member",
      href: `/members/${profile.userId}`,
    }));
}

// Mirrors getPublishedKnowledgeItems' own where-clause (lib/library-server.ts)
// exactly: published/flagged only, and (public OR contributor OR invitee OR
// admin/moderator) unless privileged. A restricted item this viewer has no
// access to is simply absent from the where-match, not filtered afterward.
async function searchLibrary(
  query: string,
  viewerId: string,
  isPrivileged: boolean,
  limit: number,
): Promise<SearchResult[]> {
  const hits = await searchLibraryDocuments(query, { limit });
  if (hits.length === 0) return [];

  const visibilityFilter = isPrivileged
    ? {}
    : {
        OR: [
          { visibility: KnowledgeVisibility.public },
          { contributorId: viewerId },
          { invitees: { some: { userId: viewerId } } },
        ],
      };

  const items = await db.knowledgeItem.findMany({
    where: {
      id: { in: hits.map((hit) => hit.id) },
      status: { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] },
      ...visibilityFilter,
    },
    select: { id: true, title: true, description: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));

  return hits
    .map((hit) => byId.get(hit.id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      id: item.id,
      type: "library" as const,
      title: item.title,
      subtitle: item.description,
      href: `/library/${item.id}`,
    }));
}

// A thread's visibility is a composite of three independent sources (its
// own member-initiated restriction, an inherited restricted Event, an
// inherited restricted KnowledgeItem) — isThreadVisible (lib/forums-server.ts)
// is the single existing function that already combines all three, reused
// here rather than reimplemented.
async function searchForums(
  query: string,
  viewerId: string,
  isPrivileged: boolean,
  limit: number,
): Promise<SearchResult[]> {
  const hits = await searchForumDocuments(query, { limit });
  if (hits.length === 0) return [];

  const threads = await db.forumThread.findMany({
    where: { id: { in: hits.map((hit) => hit.id) } },
    select: {
      id: true,
      title: true,
      authorId: true,
      visibility: true,
      invitees: { select: { userId: true } },
      event: { select: { visibility: true, hostId: true, invitees: { select: { userId: true } } } },
      knowledgeItem: { select: { visibility: true, contributorId: true, invitees: { select: { userId: true } } } },
    },
  });
  const byId = new Map(threads.map((thread) => [thread.id, thread]));

  return hits
    .map((hit): SearchResult | null => {
      const thread = byId.get(hit.id);
      if (!thread || !isThreadVisible(thread, viewerId, isPrivileged)) return null;
      return {
        id: thread.id,
        type: "forum",
        title: thread.title,
        subtitle: hit.forumName,
        href: `/forums/${hit.forumSlug}/${thread.id}`,
      };
    })
    .filter((result): result is SearchResult => result !== null);
}

// Mirrors getMemberEventById's where-clause (lib/events-server.ts):
// community-visibility, or the host, or an invitee — plus an admin bypass
// (an empty `{}` OR clause matches unconditionally), same as rsvpToEvent's
// own admin carve-out for a restricted event.
async function searchEvents(
  query: string,
  viewerId: string,
  isPrivileged: boolean,
  limit: number,
): Promise<SearchResult[]> {
  const hits = await searchEventDocuments(query, { limit });
  if (hits.length === 0) return [];

  const events = await db.event.findMany({
    where: {
      id: { in: hits.map((hit) => hit.id) },
      cancelledAt: null,
      OR: [
        { visibility: EventVisibility.community },
        { hostId: viewerId },
        { invitees: { some: { userId: viewerId } } },
        ...(isPrivileged ? [{}] : []),
      ],
    },
    select: { id: true, title: true, description: true, startsAt: true },
  });
  const byId = new Map(events.map((event) => [event.id, event]));

  return hits
    .map((hit) => byId.get(hit.id))
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .map((event) => ({
      id: event.id,
      type: "event" as const,
      title: event.title,
      subtitle: event.description,
      href: `/calendar/${event.id}`,
    }));
}

// No per-viewer gate exists (getSentAnnouncement, lib/feed-server.ts, takes
// no viewer param) — every real member sees the same set, so this mirrors
// syncAnnouncementToIndex's own index-eligibility condition exactly.
async function searchAnnouncements(query: string, limit: number): Promise<SearchResult[]> {
  const hits = await searchAnnouncementDocuments(query, limit);
  if (hits.length === 0) return [];

  const announcements = await db.announcement.findMany({
    where: { id: { in: hits.map((hit) => hit.id) }, sentAt: { not: null }, retractedAt: null, showInFeed: true },
    select: { id: true, title: true },
  });
  const byId = new Map(announcements.map((announcement) => [announcement.id, announcement]));

  return hits
    .map((hit) => byId.get(hit.id))
    .filter((announcement): announcement is NonNullable<typeof announcement> => Boolean(announcement))
    .map((announcement) => ({
      id: announcement.id,
      type: "announcement" as const,
      title: announcement.title,
      subtitle: "NASIHA Board",
      href: `/whats-new/announcements/${announcement.id}`,
    }));
}

// No per-member visibility gate exists (SurveyInvitation is response/
// delivery bookkeeping, not a viewer-specific gate) — mirrors
// syncSurveyToIndex's own index-eligibility condition exactly.
async function searchSurveys(query: string, limit: number): Promise<SearchResult[]> {
  const hits = await searchSurveyDocuments(query, { limit });
  if (hits.length === 0) return [];

  const surveys = await db.survey.findMany({
    where: {
      id: { in: hits.map((hit) => hit.id) },
      status: { in: [SurveyStatus.open, SurveyStatus.closed] },
      audienceMembers: true,
    },
    select: { id: true, title: true, description: true },
  });
  const byId = new Map(surveys.map((survey) => [survey.id, survey]));

  return hits
    .map((hit) => byId.get(hit.id))
    .filter((survey): survey is NonNullable<typeof survey> => Boolean(survey))
    .map((survey) => ({
      id: survey.id,
      type: "survey" as const,
      title: survey.title,
      subtitle: survey.description,
      href: `/surveys/${survey.id}`,
    }));
}

// canViewReviewItem/canPreviewReviewItem (lib/review-server.ts) are the
// exact existing authorization boundary — canPreviewReviewItem's open-call
// carve-out is also what keeps a search result from linking to a page that
// then 404s for a bystander.
async function searchReviewItems(query: string, viewer: UserModel, limit: number): Promise<SearchResult[]> {
  const hits = await searchReviewItemDocuments(query, { limit });
  if (hits.length === 0) return [];

  const items = await db.reviewItem.findMany({
    where: { id: { in: hits.map((hit) => hit.id) } },
    select: {
      id: true,
      title: true,
      description: true,
      submitterId: true,
      seekingReviewers: true,
      status: true,
      invitees: { select: { userId: true } },
    },
  });
  const byId = new Map(items.map((item) => [item.id, item]));

  return hits
    .map((hit) => byId.get(hit.id))
    .filter((item): item is NonNullable<typeof item> => {
      if (!item) return false;
      return canViewReviewItem(item, viewer) || canPreviewReviewItem(item, viewer);
    })
    .map((item) => ({
      id: item.id,
      type: "reviewItem" as const,
      title: item.title,
      subtitle: item.description,
      href: `/review-feedback/${item.id}`,
    }));
}
