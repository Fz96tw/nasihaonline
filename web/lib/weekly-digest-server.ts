// No "server-only" guard: imported by scripts/worker.ts (the weekly digest
// job), which runs outside Next's server runtime — same convention as
// lib/inbox-reminders.ts.
import { db } from "@/lib/db";
import {
  EventVisibility,
  ForumThreadVisibility,
  KnowledgeStatus,
  KnowledgeVisibility,
  LedgerStatus,
  LedgerTransactionType,
  Role,
} from "@/lib/generated/prisma/enums";
import { getWeeklyDigestSettings } from "@/lib/settings";
import { composeWeeklyDigest, type WeeklyDigest, type WeeklyDigestData } from "@/lib/weekly-digest-compose";
import type { WeeklyDigestSettings } from "@/lib/weekly-digest-config";

export const DIGEST_WINDOW_DAYS = 7;
/** Most public titles listed per section — keeps the post readable in a busy week. */
const MAX_LISTED_PER_SECTION = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gathers the past week's activity ending at `windowEnd`. Everything shown by
 * title is public to every member (library `public`, events/threads
 * `community` visibility); restricted/invited-only items are only counted.
 * Peer reviews, replies and new members are counts only, so nothing about a
 * private item ever leaves this function except a number.
 */
export async function gatherWeeklyDigestData(windowEnd: Date): Promise<WeeklyDigestData> {
  const windowStart = new Date(windowEnd.getTime() - DIGEST_WINDOW_DAYS * DAY_MS);
  const upcomingEnd = new Date(windowEnd.getTime() + DIGEST_WINDOW_DAYS * DAY_MS);
  const inWindow = { gte: windowStart, lt: windowEnd };

  const [
    newMembers,
    publicLibrary,
    restrictedLibrary,
    publicEvents,
    invitedEvents,
    publicThreads,
    privateThreads,
    peerReviews,
    posts,
    threadsCreated,
    earnedThisWeek,
    earnedAllTime,
  ] = await Promise.all([
    db.user.count({
      where: { createdAt: inWindow, role: { in: [Role.member, Role.moderator, Role.admin] }, tier: { not: null } },
    }),
    db.knowledgeItem.findMany({
      where: { status: KnowledgeStatus.published, visibility: KnowledgeVisibility.public, publishedAt: inWindow },
      orderBy: { publishedAt: "desc" },
      take: MAX_LISTED_PER_SECTION,
      select: { id: true, title: true },
    }),
    db.knowledgeItem.count({
      where: { status: KnowledgeStatus.published, visibility: KnowledgeVisibility.restricted, publishedAt: inWindow },
    }),
    db.event.findMany({
      where: {
        publishedAt: { not: null },
        cancelledAt: null,
        visibility: EventVisibility.community,
        startsAt: { gte: windowEnd, lt: upcomingEnd },
      },
      orderBy: { startsAt: "asc" },
      take: MAX_LISTED_PER_SECTION,
      select: { id: true, title: true, startsAt: true },
    }),
    db.event.count({
      where: {
        publishedAt: { not: null },
        cancelledAt: null,
        visibility: EventVisibility.invited,
        startsAt: { gte: windowEnd, lt: upcomingEnd },
      },
    }),
    // Linked threads (eventId / knowledgeItemId set) are the auto-created
    // discussion thread for an event or library item, not a member-started
    // forum thread.
    db.forumThread.findMany({
      where: {
        createdAt: inWindow,
        removed: false,
        eventId: null,
        knowledgeItemId: null,
        visibility: ForumThreadVisibility.community,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_LISTED_PER_SECTION,
      select: { id: true, title: true, forum: { select: { slug: true } } },
    }),
    db.forumThread.count({
      where: {
        createdAt: inWindow,
        removed: false,
        eventId: null,
        knowledgeItemId: null,
        visibility: ForumThreadVisibility.invited,
      },
    }),
    db.reviewItem.count({ where: { createdAt: inWindow } }),
    db.forumPost.findMany({
      where: { createdAt: inWindow, removed: false, selfDeleted: false, thread: { removed: false } },
      select: { threadId: true, createdAt: true },
    }),
    db.forumThread.findMany({
      where: { createdAt: inWindow, removed: false },
      select: { id: true },
    }),
    // A confirmed row counts for the week it was confirmed in (auto-posted
    // rows have no resolvedAt and are confirmed by construction, so they
    // count at creation).
    db.contributionLedger.aggregate({
      _sum: { hours: true },
      where: {
        type: LedgerTransactionType.earned,
        status: LedgerStatus.confirmed,
        OR: [{ resolvedAt: inWindow }, { resolvedAt: null, createdAt: inWindow }],
      },
    }),
    db.contributionLedger.aggregate({
      _sum: { hours: true },
      where: { type: LedgerTransactionType.earned, status: LedgerStatus.confirmed },
    }),
  ]);

  // Replies = posts in the window minus each new thread's opening post.
  const newThreadIds = new Set(threadsCreated.map((thread) => thread.id));
  const openingPostsSeen = new Set<string>();
  let replies = 0;
  const sortedPosts = [...posts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const post of sortedPosts) {
    if (newThreadIds.has(post.threadId) && !openingPostsSeen.has(post.threadId)) {
      openingPostsSeen.add(post.threadId);
      continue;
    }
    replies += 1;
  }

  return {
    windowStart,
    windowEnd,
    newMembers,
    library: { listed: publicLibrary, restrictedCount: restrictedLibrary },
    events: { listed: publicEvents, invitedCount: invitedEvents },
    forumThreads: {
      listed: publicThreads.map((thread) => ({ id: thread.id, title: thread.title, forumSlug: thread.forum.slug })),
      privateCount: privateThreads,
    },
    peerReviewsStarted: peerReviews,
    replies,
    knowledgeHours: {
      earnedThisWeek: Number(earnedThisWeek._sum.hours ?? 0),
      earnedAllTime: Number(earnedAllTime._sum.hours ?? 0),
    },
  };
}

/**
 * Builds this week's digest, or null when there's nothing to report (a quiet
 * week — no post and no emails). `settings` is injectable so a preview can
 * pass unsaved values.
 */
export async function generateWeeklyDigest(
  windowEnd: Date = new Date(),
  settings?: WeeklyDigestSettings,
): Promise<WeeklyDigest | null> {
  const resolved = settings ?? (await getWeeklyDigestSettings());
  const data = await gatherWeeklyDigestData(windowEnd);
  return composeWeeklyDigest(data, resolved, process.env.NEXT_PUBLIC_APP_URL ?? "");
}
