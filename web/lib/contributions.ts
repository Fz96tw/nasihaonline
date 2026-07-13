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

/**
 * The meeting a ledger row is tied to, when its source is an accepted
 * meeting request (§4.4/§11 #12) — surfaced so a row can't be confused with
 * a different meeting between the same two people. `date` is the *ledger
 * posting* timestamp elsewhere on the entry, which is deliberately not the
 * same thing as the meeting's own proposed time shown here.
 */
export type ContributionMeetingRef = {
  topic: string;
  /** First proposed time, ISO — a meeting can carry more than one, but only the first is shown here. */
  proposedTime: string;
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
  /** Admin's rejection reason, when status is rejected and one was given (§4.4). */
  reason: string | null;
  meetingRequest: ContributionMeetingRef | null;
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
  meetingRequest: ContributionMeetingRef | null;
};

/** Trims a trailing ".0" so whole-hour balances read as e.g. "3" rather than "3.0". */
export function formatHours(hours: number): string {
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}`;
}

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
