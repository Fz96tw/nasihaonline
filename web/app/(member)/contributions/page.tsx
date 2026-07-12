import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getActiveEarnRules,
  getContributionHistory,
  getContributionSummary,
  getPendingConfirmationsForCounterpart,
} from "@/lib/contributions-server";
import { ContributionsPanel } from "@/components/contributions/contributions-panel";

export const metadata: Metadata = {
  title: "Knowledge Hours — Nasiha",
};

export default async function ContributionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [summary, transactions, rules, pendingConfirmations] = await Promise.all([
    getContributionSummary(user.id),
    getContributionHistory(user.id),
    getActiveEarnRules(),
    getPendingConfirmationsForCounterpart(user.id),
  ]);

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Knowledge Hours</h1>
        <p className="text-muted-foreground">
          Track your contributions and log new activity for confirmation.
        </p>
      </div>

      <ContributionsPanel
        initialSummary={summary}
        initialTransactions={transactions}
        initialPendingConfirmations={pendingConfirmations}
        rules={rules}
      />
    </main>
  );
}
