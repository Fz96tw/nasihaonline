import "server-only";
import { db } from "@/lib/db";
import { recordAdminAction } from "@/lib/audit-server";
import { createNotification } from "@/lib/notifications-server";
import {
  ContributionSource,
  LedgerStatus,
  LedgerTransactionType,
  NotificationType,
  Role,
} from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import {
  formatHours,
  type ContributionMeetingRef,
  type ContributionPendingEntry,
  type ContributionRuleOption,
  type ContributionSummary,
  type ContributionTransaction,
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

/**
 * A flat {title, href} for whichever record actually triggered a ledger row
 * — event/post/library/review each has its own detail page, so unlike
 * getContributionHistory's separate `event`/`post`/`libraryItem`/`reviewItem`
 * fields (rendered with type-specific styling), this collapses them into one
 * generic reference for AdminActionLog metadata, where the Resolution
 * History table just needs *a* link to identify the item, not to
 * distinguish its type. Meeting requests have no standalone detail page
 * (they're viewed inline in /inbox), so they fall back to a title with no
 * href — same as this codebase's other unlinked meeting references.
 */
function contributionItemRef(row: {
  event: {
    attendance: { event: { id: string; title: string } } | null;
    post: { slug: string; title: string } | null;
    knowledgeItem: { id: string; title: string } | null;
    reviewComment: { reviewItem: { id: string; title: string } } | null;
  } | null;
  meetingRequestAsRequesterSpend: { topic: string; proposedTimes: Date[] } | null;
  meetingRequestAsRecipientEarn: { topic: string; proposedTimes: Date[] } | null;
}): { title: string; href: string | null } | null {
  if (row.event?.attendance?.event) {
    return { title: row.event.attendance.event.title, href: `/calendar/${row.event.attendance.event.id}` };
  }
  if (row.event?.post) return { title: row.event.post.title, href: `/blog/${row.event.post.slug}` };
  if (row.event?.knowledgeItem) {
    return { title: row.event.knowledgeItem.title, href: `/library/${row.event.knowledgeItem.id}` };
  }
  if (row.event?.reviewComment?.reviewItem) {
    return { title: row.event.reviewComment.reviewItem.title, href: `/review-feedback/${row.event.reviewComment.reviewItem.id}` };
  }
  const meeting = meetingRequestRef(row);
  if (meeting) return { title: meeting.topic, href: null };
  return null;
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
 * positive magnitude for display. Upward admin adjustments count toward
 * lifetimeEarned too (downward corrections still only affect balance) so a
 * manually-credited member sees it reflected the same way an earned session
 * would be.
 */
export async function getContributionSummary(userId: string): Promise<ContributionSummary> {
  const [grouped, positiveAdjusted] = await Promise.all([
    db.contributionLedger.groupBy({
      by: ["type"],
      where: { userId, status: LedgerStatus.confirmed },
      _sum: { hours: true },
    }),
    db.contributionLedger.aggregate({
      where: {
        userId,
        status: LedgerStatus.confirmed,
        type: LedgerTransactionType.adjusted,
        hours: { gt: 0 },
      },
      _sum: { hours: true },
    }),
  ]);

  let balance = 0;
  let lifetimeEarned = positiveAdjusted._sum.hours?.toNumber() ?? 0;
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
          reviewComment: { select: { reviewItem: { select: { id: true, title: true } } } },
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
    reviewItem: row.event?.reviewComment?.reviewItem ?? null,
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
        include: {
          rule: true,
          actor: { select: { name: true } },
          knowledgeItem: { select: { id: true, title: true } },
          reviewComment: { select: { reviewItem: { select: { id: true, title: true } } } },
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
    counterpartName: null,
    hours: row.hours.toNumber(),
    meetingRequest: meetingRequestRef(row),
    libraryItem: row.event?.knowledgeItem ?? null,
    reviewItem: row.event?.reviewComment?.reviewItem ?? null,
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
          reviewComment: { select: { reviewItem: { select: { id: true, title: true } } } },
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
    reviewItem: row.event?.reviewComment?.reviewItem ?? null,
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
 *
 * That same admin-vs-peer distinction gates the AdminActionLog write below:
 * only a resolution made in admin capacity (`isAdmin && !isNamedCounterpart`)
 * is logged, so /admin/ledger's resolution-history table reflects admin
 * decisions, not every peer's own confirmations.
 */
export async function resolveContribution(
  ledgerId: string,
  actingUser: UserModel,
  decision: typeof LedgerStatus.confirmed | typeof LedgerStatus.rejected,
  reason?: string,
) {
  const entry = await db.contributionLedger.findUnique({
    where: { id: ledgerId },
    include: {
      event: {
        include: {
          rule: true,
          attendance: { include: { event: { select: { id: true, title: true } } } },
          post: { select: { slug: true, title: true } },
          knowledgeItem: { select: { id: true, title: true } },
          reviewComment: { select: { reviewItem: { select: { id: true, title: true } } } },
        },
      },
      meetingRequestAsRequesterSpend: { select: { topic: true, proposedTimes: true } },
      meetingRequestAsRecipientEarn: { select: { topic: true, proposedTimes: true } },
      user: { select: { name: true, email: true } },
    },
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

  try {
    return await db.$transaction(async (tx) => {
      // The findUnique above is a fast-fail for the common sequential case
      // (someone else's resolution already committed before this request
      // even started) but isn't itself a safe guard against two requests
      // racing each other — both could pass that check while the row is
      // still `pending`. This updateMany's `where` re-asserts `status:
      // pending` as part of the same atomic write Postgres uses to
      // serialize concurrent UPDATEs on this row, so exactly one of two
      // simultaneous resolutions affects a row (`count === 1`) and the
      // other sees `count === 0` — a real compare-and-swap, not just a
      // read-then-write TOCTOU check.
      const result = await tx.contributionLedger.updateMany({
        where: { id: ledgerId, status: LedgerStatus.pending },
        data: {
          status: decision,
          resolvedByUserId: actingUser.id,
          resolvedAt: new Date(),
          ...(trimmedReason ? { reason: trimmedReason } : {}),
        },
      });
      if (result.count === 0) {
        // Signals the race to the catch block below, which re-reads the
        // row (outside this now-rolled-back transaction) to name who won
        // it — throwing here aborts the transaction, so nothing else in
        // this callback (the AdminActionLog write) is committed either.
        throw new ContributionResolutionError(409, "raced");
      }

      const updated = await tx.contributionLedger.findUniqueOrThrow({ where: { id: ledgerId } });

      if (isAdmin && !isNamedCounterpart) {
        const itemRef = contributionItemRef(entry);
        await recordAdminAction(
          {
            actorId: actingUser.id,
            action: `ledger.${decision}`,
            entityType: "ContributionLedger",
            entityId: ledgerId,
            metadata: {
              targetUserId: entry.userId,
              targetUserName: entry.user.name ?? entry.user.email,
              hours: entry.hours.toNumber(),
              activity: entry.event?.rule.label ?? entry.type,
              reason: trimmedReason ?? null,
              itemTitle: itemRef?.title ?? null,
              itemHref: itemRef?.href ?? null,
            },
          },
          tx,
        );
      }

      const activity = entry.event?.rule.label ?? entry.type;

      // Submitter never otherwise learns their entry was resolved — bell
      // notification only, no email, matching every other contribution
      // notification in this codebase. Skipped when the actor resolved
      // their own entry (admins can do that; no need to tell yourself).
      if (entry.userId !== actingUser.id) {
        await createNotification(
          {
            recipientId: entry.userId,
            type: decision === LedgerStatus.confirmed ? NotificationType.contribution_awarded : NotificationType.contribution_rejected,
            message:
              decision === LedgerStatus.confirmed
                ? `Your "${activity}" contribution was confirmed — ${formatHours(entry.hours.toNumber())} Knowledge Hours added to your balance.`
                : `Your "${activity}" contribution was rejected${trimmedReason ? `: ${trimmedReason}` : "."}`,
            link: "/contributions",
          },
          tx,
        );
      }

      // Named counterpart otherwise has no way to learn their pending
      // "awaiting your confirmation" entry was resolved out from under them
      // — it just disappears from their dashboard widget with no
      // explanation. Only fires when an admin resolved in place of them
      // (isNamedCounterpart false here means the counterpart isn't the one
      // who just acted); when the counterpart resolves it themselves, they
      // obviously already know.
      if (isAdmin && !isNamedCounterpart && entry.event?.counterpartId) {
        await createNotification(
          {
            recipientId: entry.event.counterpartId,
            type: NotificationType.contribution_resolved_by_admin,
            message: `An admin already ${decision} ${entry.user.name ?? entry.user.email}'s "${activity}" contribution — no action needed from you.`,
            link: "/contributions",
          },
          tx,
        );
      }

      return updated;
    });
  } catch (error) {
    if (error instanceof ContributionResolutionError && error.status === 409) {
      const latest = await db.contributionLedger.findUnique({
        where: { id: ledgerId },
        include: { resolvedByUser: { select: { name: true, email: true } } },
      });
      const resolverName = latest?.resolvedByUser?.name ?? latest?.resolvedByUser?.email ?? "someone else";
      throw new ContributionResolutionError(
        409,
        `This contribution was already ${latest?.status ?? "resolved"} by ${resolverName}.`,
      );
    }
    throw error;
  }
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

  const trimmedReason = reason.trim();

  return db.$transaction(async (tx) => {
    const entry = await tx.contributionLedger.create({
      data: {
        userId: targetUserId,
        type: LedgerTransactionType.adjusted,
        status: LedgerStatus.confirmed,
        hours,
        reason: trimmedReason,
        createdByUserId: admin.id,
        resolvedByUserId: admin.id,
        resolvedAt: new Date(),
      },
    });

    await recordAdminAction(
      {
        actorId: admin.id,
        action: "ledger.adjusted",
        entityType: "ContributionLedger",
        entityId: entry.id,
        metadata: {
          targetUserId,
          targetUserName: target.name ?? target.email,
          hours,
          reason: trimmedReason,
        },
      },
      tx,
    );

    return entry;
  });
}
