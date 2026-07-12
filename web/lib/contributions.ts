// Client-safe Knowledge Hours types (PRD §4.4) — kept separate from
// contributions-server.ts so client components can import them without
// pulling in the "server-only" query logic.
import { LedgerStatus, LedgerTransactionType } from "@/lib/generated/prisma/enums";

export type ContributionRuleOption = {
  id: string;
  activityKey: string;
  label: string;
  hours: number;
};

export type ContributionSummary = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
};

export type ContributionTransaction = {
  id: string;
  date: string;
  activity: string;
  counterpartName: string | null;
  type: LedgerTransactionType;
  status: LedgerStatus;
  /** Signed — positive for earned, negative for spent (§4.4). */
  hours: number;
};

/**
 * A `pending` ledger row surfaced for confirm/reject action (§4.4). Shared
 * shape for both the member-facing "awaiting your confirmation" list
 * (counterpart-scoped) and the admin `/admin/ledger` review queue
 * (unscoped) — `counterpartName` is null there for no-counterpart entries,
 * the ones that require admin action per §4.4.
 */
export type ContributionPendingEntry = {
  id: string;
  date: string;
  activity: string;
  actorName: string;
  counterpartName: string | null;
  hours: number;
};

export const LEDGER_STATUS_LABELS: Record<LedgerStatus, string> = {
  [LedgerStatus.pending]: "Pending",
  [LedgerStatus.confirmed]: "Confirmed",
  [LedgerStatus.rejected]: "Rejected",
};

export const LEDGER_STATUS_BADGE_VARIANT: Record<LedgerStatus, "success" | "warning" | "danger"> = {
  [LedgerStatus.confirmed]: "success",
  [LedgerStatus.pending]: "warning",
  [LedgerStatus.rejected]: "danger",
};
