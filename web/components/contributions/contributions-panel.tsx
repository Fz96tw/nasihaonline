"use client";

import { useQuery } from "@tanstack/react-query";
import { ContributionsSummaryBar } from "@/components/contributions/summary-bar";
import { ContributionsHistoryTable } from "@/components/contributions/history-table";
import {
  type ContributionRuleOption,
  type ContributionSummary,
  type ContributionTransaction,
} from "@/lib/contributions";

type HistoryResponse = { summary: ContributionSummary; transactions: ContributionTransaction[] };

async function fetchHistory(): Promise<HistoryResponse> {
  const response = await fetch("/api/contributions/history");
  if (!response.ok) throw new Error("Failed to load contribution history");
  return response.json();
}

/**
 * Client wrapper so the Log Contribution dialog can invalidate this query
 * (queryKey ["contributions-history"]) and have the summary bar + table
 * refresh immediately without a full page reload.
 */
export function ContributionsPanel({
  initialSummary,
  initialTransactions,
  rules,
}: {
  initialSummary: ContributionSummary;
  initialTransactions: ContributionTransaction[];
  rules: ContributionRuleOption[];
}) {
  const { data } = useQuery({
    queryKey: ["contributions-history"],
    queryFn: fetchHistory,
    initialData: { summary: initialSummary, transactions: initialTransactions },
  });

  return (
    <div className="flex flex-col gap-8">
      <ContributionsSummaryBar summary={data.summary} rules={rules} />
      <ContributionsHistoryTable transactions={data.transactions} />
    </div>
  );
}
