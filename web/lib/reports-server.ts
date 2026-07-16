import "server-only";
import { db } from "@/lib/db";
import {
  ApplicationStatus,
  EventType,
  KnowledgeStatus,
  LedgerStatus,
  LedgerTransactionType,
  Role,
  Tier,
} from "@/lib/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;
const QUARTER_MS = 90 * DAY_MS;

function startOfCalendarQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
}

function startOfCalendarMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Distinct member ids (role member/moderator/admin — applicants/guests
 * aren't members) with any activity in [since, until). "Activity" has no
 * dedicated tracking column anywhere in the schema, so this is a documented
 * proxy: presence in any of the content/exchange tables a member action
 * would land in, rather than a single `lastActiveAt` field.
 */
async function activeMemberIds(since: Date, until: Date): Promise<Set<string>> {
  const [ledger, rsvps, forumPosts, posts, comments, knowledgeItems] = await Promise.all([
    db.contributionLedger.findMany({
      where: { createdAt: { gte: since, lt: until } },
      select: { userId: true },
    }),
    db.rSVP.findMany({ where: { createdAt: { gte: since, lt: until } }, select: { userId: true } }),
    db.forumPost.findMany({ where: { createdAt: { gte: since, lt: until } }, select: { authorId: true } }),
    db.post.findMany({ where: { createdAt: { gte: since, lt: until } }, select: { authorId: true } }),
    db.postComment.findMany({ where: { createdAt: { gte: since, lt: until } }, select: { authorId: true } }),
    db.knowledgeItem.findMany({
      where: { createdAt: { gte: since, lt: until } },
      select: { contributorId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const row of ledger) ids.add(row.userId);
  for (const row of rsvps) ids.add(row.userId);
  for (const row of forumPosts) ids.add(row.authorId);
  for (const row of posts) ids.add(row.authorId);
  for (const row of comments) ids.add(row.authorId);
  for (const row of knowledgeItems) ids.add(row.contributorId);
  return ids;
}

export interface CommunityHealthReport {
  recentlyActiveMemberCount: number;
  retentionRateYoY: number | null;
  countriesRepresented: number;
  newMembersThisQuarter: number;
  studentTraineeRepresentationPct: number | null;
}

/**
 * §4.11/Nasiha_KPIs.md Community Health group. "Past quarter" is a trailing
 * 90-day window from now, not a calendar quarter — more meaningful for a
 * recency check than snapping to Jan/Apr/Jul/Oct boundaries. YoY retention
 * compares that window against the same trailing-90-day window one year
 * back; with a young platform that prior-year cohort may be empty, in which
 * case the rate is reported as null (not 0%) rather than a misleading ratio.
 */
export async function getCommunityHealthReport(): Promise<CommunityHealthReport> {
  const now = new Date();
  const quarterAgo = new Date(now.getTime() - QUARTER_MS);
  const yearAgoWindowEnd = new Date(now.getTime() - 365 * DAY_MS);
  const yearAgoWindowStart = new Date(yearAgoWindowEnd.getTime() - QUARTER_MS);

  const [recentIds, priorYearIds, countryRows, newMembers, memberTierCounts] = await Promise.all([
    activeMemberIds(quarterAgo, now),
    activeMemberIds(yearAgoWindowStart, yearAgoWindowEnd),
    db.profile.findMany({
      where: { countryRegion: { not: null, notIn: [""] } },
      select: { countryRegion: true },
      distinct: ["countryRegion"],
    }),
    db.membershipApplication.count({
      where: { status: ApplicationStatus.approved, reviewedAt: { gte: startOfCalendarQuarter(now) } },
    }),
    db.user.groupBy({
      by: ["tier"],
      where: { role: { in: [Role.member, Role.moderator, Role.admin] }, tier: { not: null } },
      _count: { _all: true },
    }),
  ]);

  let retentionRateYoY: number | null = null;
  if (priorYearIds.size > 0) {
    let retained = 0;
    priorYearIds.forEach((id) => {
      if (recentIds.has(id)) retained += 1;
    });
    retentionRateYoY = (retained / priorYearIds.size) * 100;
  }

  const totalTieredMembers = memberTierCounts.reduce((sum, row) => sum + row._count._all, 0);
  const studentCount = memberTierCounts.find((row) => row.tier === Tier.student)?._count._all ?? 0;

  return {
    recentlyActiveMemberCount: recentIds.size,
    retentionRateYoY,
    countriesRepresented: countryRows.length,
    newMembersThisQuarter: newMembers,
    studentTraineeRepresentationPct: totalTieredMembers > 0 ? (studentCount / totalTieredMembers) * 100 : null,
  };
}

export interface KnowledgeExchangeReport {
  lecturesWebinarsThisMonth: number;
  caseDiscussionsThisMonth: number;
  totalHoursEarned: number;
  totalHoursSpent: number;
  earnSpendRatio: number | null;
  uniqueContributorRecipientPairings: number;
  resourcesShared: number;
}

/** §4.11/Nasiha_KPIs.md Knowledge Exchange Activity group. */
export async function getKnowledgeExchangeReport(): Promise<KnowledgeExchangeReport> {
  const now = new Date();
  const monthStart = startOfCalendarMonth(now);

  const [lectureWebinarCount, caseDiscussionCount, confirmedSums, pairings, resourcesShared] =
    await Promise.all([
      db.event.count({
        where: { type: { in: [EventType.lecture, EventType.webinar] }, startsAt: { gte: monthStart } },
      }),
      db.event.count({
        where: { type: EventType.case_discussion, startsAt: { gte: monthStart } },
      }),
      db.contributionLedger.groupBy({
        by: ["type"],
        where: { status: LedgerStatus.confirmed },
        _sum: { hours: true },
      }),
      db.contributionEvent.findMany({
        where: { counterpartId: { not: null } },
        select: { actorId: true, counterpartId: true },
        distinct: ["actorId", "counterpartId"],
      }),
      db.knowledgeItem.count({ where: { status: { not: KnowledgeStatus.rejected } } }),
    ]);

  let totalHoursEarned = 0;
  let totalHoursSpent = 0;
  for (const row of confirmedSums) {
    const sum = row._sum.hours?.toNumber() ?? 0;
    if (row.type === LedgerTransactionType.earned) totalHoursEarned += sum;
    if (row.type === LedgerTransactionType.spent) totalHoursSpent += Math.abs(sum);
  }

  return {
    lecturesWebinarsThisMonth: lectureWebinarCount,
    caseDiscussionsThisMonth: caseDiscussionCount,
    totalHoursEarned,
    totalHoursSpent,
    earnSpendRatio: totalHoursSpent > 0 ? totalHoursEarned / totalHoursSpent : null,
    uniqueContributorRecipientPairings: pairings.length,
    resourcesShared,
  };
}

export interface OrganizationalHealthReport {
  avgApplicationTurnaroundDays: number | null;
  conductIncidentCount: number;
  conductIncidentsResolved: number;
  ledgerReconciliation: {
    totalConfirmedTransactions: number;
    integrityIssueCount: number;
  };
}

/**
 * §4.11/Nasiha_KPIs.md Organizational Health group. The "ledger accuracy /
 * reconciliation check" (§7.1) has no stored balance to diff against by
 * design (balance is always SUM(confirmed) — see contributions-server.ts),
 * so reconciliation here means a data-integrity sweep of the invariants the
 * app enforces at write time: every `adjusted` row carries a reason and an
 * admin actor, `earned` rows are positive, `spent` rows are negative.
 */
export async function getOrganizationalHealthReport(): Promise<OrganizationalHealthReport> {
  const [decidedApplications, conductIncidentCount, conductResolvedCount, confirmedRows] = await Promise.all([
    db.membershipApplication.findMany({
      where: { reviewedAt: { not: null } },
      select: { createdAt: true, reviewedAt: true },
    }),
    db.codeOfConductViolation.count(),
    db.codeOfConductViolation.count({ where: { actionTaken: { not: null } } }),
    db.contributionLedger.findMany({
      where: { status: LedgerStatus.confirmed },
      select: { type: true, hours: true, reason: true, createdByUserId: true },
    }),
  ]);

  let avgApplicationTurnaroundDays: number | null = null;
  if (decidedApplications.length > 0) {
    const totalDays = decidedApplications.reduce((sum, app) => {
      const days = (app.reviewedAt!.getTime() - app.createdAt.getTime()) / DAY_MS;
      return sum + days;
    }, 0);
    avgApplicationTurnaroundDays = totalDays / decidedApplications.length;
  }

  let integrityIssueCount = 0;
  for (const row of confirmedRows) {
    const hours = row.hours.toNumber();
    if (row.type === LedgerTransactionType.adjusted && (!row.reason?.trim() || !row.createdByUserId)) {
      integrityIssueCount += 1;
    } else if (row.type === LedgerTransactionType.earned && hours <= 0) {
      integrityIssueCount += 1;
    } else if (row.type === LedgerTransactionType.spent && hours >= 0) {
      integrityIssueCount += 1;
    }
  }

  return {
    avgApplicationTurnaroundDays,
    conductIncidentCount,
    conductIncidentsResolved: conductResolvedCount,
    ledgerReconciliation: {
      totalConfirmedTransactions: confirmedRows.length,
      integrityIssueCount,
    },
  };
}
