import "server-only";
import { db } from "@/lib/db";
import { LedgerStatus, LedgerTransactionType } from "@/lib/generated/prisma/enums";
import type {
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
