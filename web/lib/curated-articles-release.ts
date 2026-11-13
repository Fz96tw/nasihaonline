// No "server-only" guard: scripts/worker.ts imports this module (the
// release tick), same convention as lib/curated-article-fetch.ts. The rules
// themselves live in lib/curated-article-schedule.ts; this file only feeds
// them database rows and applies the result.

import { db } from "@/lib/db";
import { ExternalArticleStatus } from "@/lib/generated/prisma/enums";
import { getCuratedArticlesPerCommunityPerWeek } from "@/lib/settings";
import {
  GENERAL_SLOT,
  WEEK_MS,
  estimateReleaseTimes,
  planReleases,
  summarizeSlots,
  type QueuedArticle,
  type ReleasedArticle,
} from "@/lib/curated-article-schedule";

async function loadQueueState(now: Date): Promise<{ queue: QueuedArticle[]; recent: ReleasedArticle[]; perWeek: number }> {
  const [scheduled, published, perWeek] = await Promise.all([
    db.externalArticle.findMany({
      where: { status: ExternalArticleStatus.scheduled },
      select: { id: true, scheduledAt: true, fetchedAt: true, communities: { select: { communityId: true } } },
    }),
    db.externalArticle.findMany({
      where: { status: ExternalArticleStatus.approved, approvedAt: { gt: new Date(now.getTime() - WEEK_MS), lte: now } },
      select: { approvedAt: true, communities: { select: { communityId: true } } },
    }),
    getCuratedArticlesPerCommunityPerWeek(),
  ]);
  return {
    queue: scheduled.map((article) => ({
      id: article.id,
      // scheduledAt is always set on entering the queue; fetchedAt is only a defensive fallback.
      scheduledAt: article.scheduledAt ?? article.fetchedAt,
      communityIds: article.communities.map((c) => c.communityId),
    })),
    recent: published.map((article) => ({
      approvedAt: article.approvedAt as Date,
      communityIds: article.communities.map((c) => c.communityId),
    })),
    perWeek,
  };
}

/**
 * One worker tick: publishes whichever scheduled articles the cadence allows
 * right now. Each publish is a compare-and-set on `status: scheduled`, so an
 * admin's concurrent Post now / Unschedule wins cleanly and a second worker
 * can't double-release.
 */
export async function releaseDueCuratedArticles(now: Date = new Date()): Promise<{ released: string[] }> {
  const state = await loadQueueState(now);
  if (state.queue.length === 0) return { released: [] };
  const due = planReleases({ ...state, now });
  const released: string[] = [];
  for (const id of due) {
    const result = await db.externalArticle.updateMany({
      where: { id, status: ExternalArticleStatus.scheduled },
      data: { status: ExternalArticleStatus.approved, approvedAt: now, lastActivityAt: now },
    });
    if (result.count > 0) released.push(id);
  }
  return { released };
}

export type ScheduledOverview = {
  perWeek: number;
  /** Estimated release time per queued article id (ISO), null if beyond the estimate horizon. */
  estimates: Record<string, string | null>;
  slots: { slot: string; label: string; queued: number; releasedThisWeek: number; nextReleaseAt: string | null }[];
};

/** Everything the admin Scheduled tab shows, computed with the worker's own rules. */
export async function getScheduledOverview(now: Date = new Date()): Promise<ScheduledOverview> {
  const state = await loadQueueState(now);
  const estimates = estimateReleaseTimes({ ...state, now });
  const summary = summarizeSlots({ ...state, now });
  const communityIds = summary.map((s) => s.slot).filter((slot) => slot !== GENERAL_SLOT);
  const names = new Map(
    (await db.community.findMany({ where: { id: { in: communityIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );
  return {
    perWeek: state.perWeek,
    estimates: Object.fromEntries(Array.from(estimates.entries()).map(([id, date]) => [id, date ? date.toISOString() : null])),
    slots: summary
      .filter((s) => s.queued > 0 || s.releasedThisWeek > 0)
      .map((s) => ({
        slot: s.slot,
        label: s.slot === GENERAL_SLOT ? "General (no community)" : (names.get(s.slot) ?? "Unknown community"),
        queued: s.queued,
        releasedThisWeek: s.releasedThisWeek,
        nextReleaseAt: s.nextReleaseAt ? s.nextReleaseAt.toISOString() : null,
      }))
      .sort((a, b) => b.queued - a.queued || a.label.localeCompare(b.label)),
  };
}
