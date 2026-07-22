import "server-only";
import { db } from "@/lib/db";
import { ContributionSource, LedgerStatus, LedgerTransactionType, Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import type {
  ContributionMeetingRef,
  ContributionPendingEntry,
  ContributionRuleOption,
  ContributionSummary,
  ContributionTransaction,
} from "@/lib/contributions";

/**
 * A ledger row is linked to at most one MeetingRequest, from either side of
 * the two relations added for §11's resolved open question #12 (requester's
 * spend, recipient's earn) — never both, since each relation is 1:1 on a
 * distinct FK. Surfacing the meeting's own topic/proposed time here is what
 * lets a ledger row be told apart from a different meeting between the same
 * two people, since the row's own `date` is when it was *posted*, not the
 * meeting's date.
 */
function meetingRequestRef(row: {
  meetingRequestAsRequesterSpend: { topic: string; proposedTimes: Date[] } | null;
  meetingRequestAsRecipientEarn: { topic: string; proposedTimes: Date[] } | null;
}): ContributionMeetingRef | null {
  const meeting = row.meetingRequestAsRequesterSpend ?? row.meetingRequestAsRecipientEarn;
  if (!meeting || meeting.proposedTimes.length === 0) return null;
  return { topic: meeting.topic, proposedTime: meeting.proposedTimes[0].toISOString() };
}

/** Activities selectable from the "Log Contribution" form (§4.4) — active, earn-type rules only. */
export async function getActiveEarnRules(): Promise<ContributionRuleOption[]> {
  const rules = await db.contributionRule.findMany({
    where: { active: true, type: LedgerTransactionType.earned },
    orderBy: { label: "asc" },
  });

  return rules.map((rule) => ({
    id: rule.id,
    activityKey: rule.activityKey,
    label: rule.label,
    hours: rule.hours.toNumber(),
  }));
}

/**
 * Balance and lifetime totals sourced from `confirmed` transactions only
 * (§4.4) — pending/rejected rows never affect these numbers. `hours` is
 * signed in the ledger (positive earned, negative spent, either sign for
 * adjusted), so balance is a plain sum and lifetimeSpent is reported as a
 * positive magnitude for display.
 */
export async function getContributionSummary(userId: string): Promise<ContributionSummary> {
  const grouped = await db.contributionLedger.groupBy({
    by: ["type"],
    where: { userId, status: LedgerStatus.confirmed },
    _sum: { hours: true },
  });

  let balance = 0;
  let lifetimeEarned = 0;
  let lifetimeSpent = 0;

  for (const group of grouped) {
    const sum = group._sum.hours?.toNumber() ?? 0;
    balance += sum;
    if (group.type === LedgerTransactionType.earned) lifetimeEarned += sum;
    if (group.type === LedgerTransactionType.spent) lifetimeSpent += Math.abs(sum);
  }

  return { balance, lifetimeEarned, lifetimeSpent };
}

/**
 * Count of confirmed, earned-type ledger rows for a member (§4.4) — one per
 * logged contribution (mentorship session, event hosted, case discussion,
 * etc.), for the dashboard's "Sessions contributed" stat. Same confirmed-only
 * filter as getContributionSummary's lifetimeEarned, just counted rather than
 * summed.
 */
export async function getConfirmedEarnedSessionCount(userId: string): Promise<number> {
  return db.contributionLedger.count({
    where: { userId, status: LedgerStatus.confirmed, type: LedgerTransactionType.earned },
  });
}

/** Full transaction history for a member, newest first (§4.4). */
export async function getContributionHistory(userId: string): Promise<ContributionTransaction[]> {
  const rows = await db.contributionLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      event: {
        include: {
          rule: true,
          counterpart: { select: { name: true } },
          attendance: { include: { event: { select: { id: true, title: true } } } },
          post: { select: { slug: true, title: true } },
          knowledgeItem: { select: { id: true, title: true } },
        },
      },
      meetingRequestAsRequesterSpend: { select: { topic: true, proposedTimes: true } },
      meetingRequestAsRecipientEarn: { select: { topic: true, proposedTimes: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.createdAt.toISOString(),
    activity:
      row.event?.rule.label ??
      (row.type === LedgerTransactionType.adjusted ? `Adjustment${row.reason ? `: ${row.reason}` : ""}` : row.type),
    counterpartName: row.event?.counterpart?.name ?? null,
    type: row.type,
    status: row.status,
    hours: row.hours.toNumber(),
    reason: row.status === LedgerStatus.rejected ? row.reason : null,
    meetingRequest: meetingRequestRef(row),
    event: row.event?.attendance?.event ?? null,
    post: row.event?.post ?? null,
    libraryItem: row.event?.knowledgeItem ?? null,
    note: row.event?.source === ContributionSource.self_reported ? row.event.note : null,
  }));
}

function pendingEntryLabel(row: {
  type: LedgerTransactionType;
  reason: string | null;
  event: { rule: { label: string } } | null;
}) {
  return (
    row.event?.rule.label ??
    (row.type === LedgerTransactionType.adjusted ? `Adjustment${row.reason ? `: ${row.reason}` : ""}` : row.type)
  );
}

/**
 * Pending entries naming `userId` as the counterpart (§4.4 peer
 * confirmation) — the member-facing "awaiting your confirmation" list.
 */
export async function getPendingConfirmationsForCounterpart(
  userId: string,
): Promise<ContributionPendingEntry[]> {
  const rows = await db.contributionLedger.findMany({
    where: { status: LedgerStatus.pending, event: { counterpartId: userId } },
    orderBy: { createdAt: "asc" },
    include: {
      event: {
        include: { rule: true, actor: { select: { name: true } }, knowledgeItem: { select: { id: true, title: true } } },
      },
      meetingRequestAsRequesterSpend: { select: { topic: true, proposedTimes: true } },
      meetingRequestAsRecipientEarn: { select: { topic: true, proposedTimes: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.createdAt.toISOString(),
    activity: pendingEntryLabel(row),
    actorName: row.event?.actor.name ?? "Unknown",
    counterpartName: null,
    hours: row.hours.toNumber(),
    meetingRequest: meetingRequestRef(row),
    libraryItem: row.event?.knowledgeItem ?? null,
  }));
}

/**
 * All pending entries, for the admin `/admin/ledger` review queue (§4.4).
 * Includes entries that also have a named counterpart — an admin may
 * confirm/reject those too (AC4) — but the ones with `counterpartName: null`
 * are the ones that *require* admin action since there's no peer to do it.
 */
export async function getPendingLedgerEntriesForAdmin(): Promise<ContributionPendingEntry[]> {
  const rows = await db.contributionLedger.findMany({
    where: { status: LedgerStatus.pending },
    orderBy: { createdAt: "asc" },
    include: {
      event: {
        include: {
          rule: true,
          actor: { select: { name: true } },
          counterpart: { select: { name: true } },
          knowledgeItem: { select: { id: true, title: true } },
        },
      },
      meetingRequestAsRequesterSpend: { select: { topic: true, proposedTimes: true } },
      meetingRequestAsRecipientEarn: { select: { topic: true, proposedTimes: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.createdAt.toISOString(),
    activity: pendingEntryLabel(row),
    actorName: row.event?.actor.name ?? "Unknown",
    counterpartName: row.event?.counterpart?.name ?? null,
    hours: row.hours.toNumber(),
    meetingRequest: meetingRequestRef(row),
    libraryItem: row.event?.knowledgeItem ?? null,
  }));
}

/** Cheap count for the `/admin` dashboard badge — mirrors getPendingLedgerEntriesForAdmin's filter. */
export async function getPendingLedgerCountForAdmin(): Promise<number> {
  return db.contributionLedger.count({ where: { status: LedgerStatus.pending } });
}

export class ContributionResolutionError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Confirms or rejects a pending ledger entry (§4.4's hybrid posting model).
 * Authorization: the entry's named counterpart or any admin can resolve it —
 * including an admin resolving their own submission. Admins are trusted
 * actors and every resolution is attributed (`resolvedByUserId`) and
 * immutable, so self-resolution is auditable rather than anonymous.
 * Non-admin submitters still can't resolve their own entry; entries with no
 * named counterpart require an admin.
 *
 * `reason` is required when an admin rejects in their admin capacity (i.e.
 * not also the named counterpart) — same audit requirement as the
 * membership-application rejection flow. A named counterpart rejecting
 * their own peer-confirmation entry doesn't need one; that includes an
 * admin who happens to be the named counterpart, since they're acting in
 * the peer role there, not the admin one.
 */
export async function resolveContribution(
  ledgerId: string,
  actingUser: UserModel,
  decision: typeof LedgerStatus.confirmed | typeof LedgerStatus.rejected,
  reason?: string,
) {
  const entry = await db.contributionLedger.findUnique({
    where: { id: ledgerId },
    include: { event: true },
  });

  if (!entry) throw new ContributionResolutionError(404, "Contribution not found.");
  if (entry.status !== LedgerStatus.pending) {
    throw new ContributionResolutionError(409, `Contribution is already ${entry.status}.`);
  }

  const isAdmin = actingUser.role === Role.admin;
  if (entry.userId === actingUser.id && !isAdmin) {
    throw new ContributionResolutionError(403, "You can't confirm or reject your own contribution.");
  }

  const isNamedCounterpart = entry.event?.counterpartId === actingUser.id;
  if (!isNamedCounterpart && !isAdmin) {
    throw new ContributionResolutionError(
      403,
      "Only the named counterpart or an admin can confirm or reject this.",
    );
  }

  const trimmedReason = reason?.trim();
  if (decision === LedgerStatus.rejected && isAdmin && !isNamedCounterpart && !trimmedReason) {
    throw new ContributionResolutionError(400, "A reason is required to reject this contribution.");
  }

  return db.contributionLedger.update({
    where: { id: ledgerId },
    data: {
      status: decision,
      resolvedByUserId: actingUser.id,
      resolvedAt: new Date(),
      ...(trimmedReason ? { reason: trimmedReason } : {}),
    },
  });
}

export class LedgerAdjustmentError extends Error {
  constructor(
    public readonly status: 404,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Manual balance correction (§4.4/§4.11 "ledger auditing") — the only way a
 * balance changes outside normal earn/spend. Posted `confirmed` by
 * construction (it's an admin action, not a peer-confirmed self-report), so
 * it has no `eventId` (no originating ContributionEvent) and is both
 * created and resolved by the same admin.
 */
export async function createLedgerAdjustment(
  admin: UserModel,
  targetUserId: string,
  hours: number,
  reason: string,
) {
  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new LedgerAdjustmentError(404, "Member not found.");

  return db.contributionLedger.create({
    data: {
      userId: targetUserId,
      type: LedgerTransactionType.adjusted,
      status: LedgerStatus.confirmed,
      hours,
      reason: reason.trim(),
      createdByUserId: admin.id,
      resolvedByUserId: admin.id,
      resolvedAt: new Date(),
    },
  });
}
