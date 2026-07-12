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
