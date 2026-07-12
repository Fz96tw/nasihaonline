import "server-only";
import { db } from "@/lib/db";
import { LedgerStatus, LedgerTransactionType, Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import type {
  ContributionPendingEntry,
  ContributionRuleOption,
  ContributionSummary,
  ContributionTransaction,
} from "@/lib/contributions";

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

/** Full transaction history for a member, newest first (§4.4). */
export async function getContributionHistory(userId: string): Promise<ContributionTransaction[]> {
  const rows = await db.contributionLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { event: { include: { rule: true, counterpart: { select: { name: true } } } } },
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
    include: { event: { include: { rule: true, actor: { select: { name: true } } } } },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.createdAt.toISOString(),
    activity: pendingEntryLabel(row),
    actorName: row.event?.actor.name ?? "Unknown",
    counterpartName: null,
    hours: row.hours.toNumber(),
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
        include: { rule: true, actor: { select: { name: true } }, counterpart: { select: { name: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.createdAt.toISOString(),
    activity: pendingEntryLabel(row),
    actorName: row.event?.actor.name ?? "Unknown",
    counterpartName: row.event?.counterpart?.name ?? null,
    hours: row.hours.toNumber(),
  }));
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
 * Authorization: the submitter can never resolve their own entry, even as
 * admin; the entry's named counterpart or any admin can. Entries with no
 * named counterpart therefore require an admin.
 */
export async function resolveContribution(
  ledgerId: string,
  actingUser: UserModel,
  decision: typeof LedgerStatus.confirmed | typeof LedgerStatus.rejected,
) {
  const entry = await db.contributionLedger.findUnique({
    where: { id: ledgerId },
    include: { event: true },
  });

  if (!entry) throw new ContributionResolutionError(404, "Contribution not found.");
  if (entry.status !== LedgerStatus.pending) {
    throw new ContributionResolutionError(409, `Contribution is already ${entry.status}.`);
  }
  if (entry.userId === actingUser.id) {
    throw new ContributionResolutionError(403, "You can't confirm or reject your own contribution.");
  }

  const isNamedCounterpart = entry.event?.counterpartId === actingUser.id;
  const isAdmin = actingUser.role === Role.admin;
  if (!isNamedCounterpart && !isAdmin) {
    throw new ContributionResolutionError(
      403,
      "Only the named counterpart or an admin can confirm or reject this.",
    );
  }

  return db.contributionLedger.update({
    where: { id: ledgerId },
    data: { status: decision, resolvedByUserId: actingUser.id, resolvedAt: new Date() },
  });
}
