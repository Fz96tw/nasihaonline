"use client";

import { useQuery } from "@tanstack/react-query";
import { ContributionsSummaryBar } from "@/components/contributions/summary-bar";
import { ContributionsHistoryTable } from "@/components/contributions/history-table";
import { PendingConfirmations } from "@/components/contributions/pending-confirmations";
import { KnowledgeExchangeTable } from "@/components/home/knowledge-exchange-table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  type ContributionPendingEntry,
  type ContributionRuleOption,
  type ContributionSummary,
  type ContributionTransaction,
} from "@/lib/contributions";

type HistoryResponse = {
  summary: ContributionSummary;
  transactions: ContributionTransaction[];
  pendingConfirmations: ContributionPendingEntry[];
};

async function fetchHistory(): Promise<HistoryResponse> {
  const response = await fetch("/api/contributions/history");
  if (!response.ok) throw new Error("Failed to load contribution history");
  return response.json();
}

/**
 * Client wrapper so the Log Contribution dialog and the pending-confirmation
 * actions can invalidate this one query (queryKey ["contributions-history"])
 * and have the summary bar, history table, and pending list all refresh
 * together without a full page reload.
 */
export function ContributionsPanel({
  initialSummary,
  initialTransactions,
  initialPendingConfirmations,
  rules,
}: {
  initialSummary: ContributionSummary;
  initialTransactions: ContributionTransaction[];
  initialPendingConfirmations: ContributionPendingEntry[];
  rules: ContributionRuleOption[];
}) {
  const { data } = useQuery({
    queryKey: ["contributions-history"],
    queryFn: fetchHistory,
    initialData: {
      summary: initialSummary,
      transactions: initialTransactions,
      pendingConfirmations: initialPendingConfirmations,
    },
  });

  return (
    <div className="flex flex-col gap-8">
      {data.pendingConfirmations.length > 0 && (
        <PendingConfirmations entries={data.pendingConfirmations} />
      )}
      <ContributionsSummaryBar summary={data.summary} />
      <Accordion type="single" collapsible>
        <AccordionItem value="how-it-works" className="border-none">
          <AccordionTrigger className="w-fit flex-none grow-0 gap-2 font-heading text-lg font-semibold hover:no-underline">
            How Knowledge Hours work
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <KnowledgeExchangeTable />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <ContributionsHistoryTable transactions={data.transactions} rules={rules} />
    </div>
  );
}
