import type { Metadata } from "next";
import Link from "next/link";
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
  title: "Knowledge Hours — NASIHA",
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
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Back to Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Knowledge Hours</h1>
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
