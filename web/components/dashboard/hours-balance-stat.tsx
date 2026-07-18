import { getContributionSummary } from "@/lib/contributions-server";
import { StatCard } from "@/components/dashboard/stat-card";

// Live confirmed balance from the Contribution Ledger, replacing the
// zero-state placeholder now that 3.1-3.5 have landed (PRD §10 Phase 3).
export async function HoursBalanceStat({ userId }: { userId: string }) {
  const { balance } = await getContributionSummary(userId);

  return (
    <StatCard
      label="Hours balance"
      numericValue={balance}
      decimals={balance % 1 === 0 ? 0 : 1}
      sublabel="Knowledge Hours"
      href="/contributions"
      linkLabel="View history"
    />
  );
}
