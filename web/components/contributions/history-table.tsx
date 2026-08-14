"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogContributionDialog } from "@/components/contributions/log-contribution-dialog";
import {
  LEDGER_STATUS_BADGE_VARIANT,
  LEDGER_STATUS_LABELS,
  transactionItemTypeLabel,
  type ContributionRuleOption,
  type ContributionTransaction,
} from "@/lib/contributions";
import { LedgerStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMeetingTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatSignedHours(hours: number): string {
  const sign = hours > 0 ? "+" : "";
  const rounded = Math.abs(hours) % 1 === 0 ? Math.abs(hours) : Math.abs(hours).toFixed(1);
  return `${sign}${hours < 0 ? "-" : ""}${rounded}`;
}

/**
 * Manual admin adjustments carry a free-text reason appended to the activity
 * label (e.g. "Adjustment: correcting duplicate entry"), so each one would
 * otherwise fragment into its own single-count filter pill. Bucket them
 * together under one "Adjustment" pill; the full reason still shows in the
 * table row itself.
 */
function activityFilterKey(activity: string): string {
  return activity.startsWith("Adjustment") ? "Adjustment" : activity;
}

function hasLinkedItem(transaction: ContributionTransaction): boolean {
  return Boolean(
    transaction.event ||
      transaction.post ||
      transaction.libraryItem ||
      transaction.reviewItem ||
      transaction.meetingRequest,
  );
}

/** Sentinel activeFilter value for the "Manual" pill — filters by item type (no linked record) rather than by activity. */
const MANUAL_FILTER_KEY = "__manual__";

function ActivityFilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {label}
      <span
        className={cn(
          "ml-1 text-[0.65rem] tabular-nums",
          active ? "text-primary-foreground/80" : "text-muted-foreground/80",
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function ContributionsHistoryTable({
  transactions,
  rules,
}: {
  transactions: ContributionTransaction[];
  rules: ContributionRuleOption[];
}) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  if (transactions.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold">Contribution History</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every activity you&apos;ve logged or earned, and whether it&apos;s confirmed, pending, or
          rejected. Most credit appears here automatically — if something&apos;s missing or was
          rejected unexpectedly, use Log Contribution below to flag it for an admin.
        </p>
        <div className="mt-3 flex justify-end">
          <LogContributionDialog rules={rules} />
        </div>
        <p className="mt-2 rounded-[10px] border bg-card py-16 text-center text-muted-foreground shadow-sm">
          No contributions logged yet.
        </p>
      </div>
    );
  }

  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    const key = activityFilterKey(transaction.activity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const activityGroups = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const manualCount = transactions.filter((transaction) => !hasLinkedItem(transaction)).length;

  const filteredTransactions =
    activeFilter === null
      ? transactions
      : activeFilter === MANUAL_FILTER_KEY
        ? transactions.filter((transaction) => !hasLinkedItem(transaction))
        : transactions.filter((transaction) => activityFilterKey(transaction.activity) === activeFilter);

  return (
    <div>
      <h2 className="text-lg font-semibold">Contribution History</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every activity you&apos;ve logged or earned, and whether it&apos;s confirmed, pending, or
        rejected. Most credit appears here automatically — if something&apos;s missing or was
        rejected unexpectedly, use Log Contribution below to flag it for an admin.
      </p>
      <div className="mt-3 flex justify-end">
        <LogContributionDialog rules={rules} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <ActivityFilterPill
          label="All"
          count={transactions.length}
          active={activeFilter === null}
          onClick={() => setActiveFilter(null)}
        />
        {manualCount > 0 && (
          <ActivityFilterPill
            label="Manual"
            count={manualCount}
            active={activeFilter === MANUAL_FILTER_KEY}
            onClick={() =>
              setActiveFilter((current) => (current === MANUAL_FILTER_KEY ? null : MANUAL_FILTER_KEY))
            }
          />
        )}
        {activityGroups.map(([key, count]) => (
          <ActivityFilterPill
            key={key}
            label={key}
            count={count}
            active={activeFilter === key}
            onClick={() => setActiveFilter((current) => (current === key ? null : key))}
          />
        ))}
      </div>
      <div className="mt-3 rounded-[10px] border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Counterpart</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.map((transaction) => {
              const notConfirmed = transaction.status !== LedgerStatus.confirmed;
              const linked = hasLinkedItem(transaction);
              const isAdjustment = transaction.activity.startsWith("Adjustment");
              const itemTypeBadge = (
                <Badge variant="neutral" className="flex-shrink-0">
                  {transactionItemTypeLabel(transaction)}
                </Badge>
              );
              return (
                <TableRow key={transaction.id} className={cn(notConfirmed && "text-muted-foreground")}>
                  <TableCell>{formatDate(transaction.date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {!linked && isAdjustment && itemTypeBadge}
                      <span>{transaction.activity}</span>
                    </div>
                    {!linked && !isAdjustment && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {itemTypeBadge}
                        <span>You manually requested credit with &quot;Log Contribution&quot;</span>
                      </p>
                    )}
                    {transaction.event && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {itemTypeBadge}
                        <Link href={`/calendar/${transaction.event.id}`} className="hover:underline">
                          {transaction.event.title}
                        </Link>
                      </p>
                    )}
                    {transaction.post && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {itemTypeBadge}
                        <Link href={`/blog/${transaction.post.slug}`} className="hover:underline">
                          {transaction.post.title}
                        </Link>
                      </p>
                    )}
                    {transaction.libraryItem && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {itemTypeBadge}
                        <Link href={`/library/${transaction.libraryItem.id}`} className="hover:underline">
                          {transaction.libraryItem.title}
                        </Link>
                      </p>
                    )}
                    {transaction.reviewItem && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {itemTypeBadge}
                        <Link href={`/review-feedback/${transaction.reviewItem.id}`} className="hover:underline">
                          {transaction.reviewItem.title}
                        </Link>
                      </p>
                    )}
                    {transaction.meetingRequest && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {itemTypeBadge}
                        <span>
                          {transaction.meetingRequest.topic} · proposed for{" "}
                          {formatMeetingTime(transaction.meetingRequest.proposedTime)}
                        </span>
                      </p>
                    )}
                    {transaction.note && (
                      <p className="mt-1 text-xs text-muted-foreground">Note: {transaction.note}</p>
                    )}
                    {transaction.status === LedgerStatus.rejected && transaction.reason && (
                      <p className="mt-1 text-xs text-muted-foreground">Reason: {transaction.reason}</p>
                    )}
                  </TableCell>
                  <TableCell>{transaction.counterpartName ?? "—"}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      !notConfirmed && transaction.hours > 0 && "text-success",
                      !notConfirmed && transaction.hours < 0 && "text-destructive",
                    )}
                  >
                    {formatSignedHours(transaction.hours)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={LEDGER_STATUS_BADGE_VARIANT[transaction.status]}>
                      {LEDGER_STATUS_LABELS[transaction.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
