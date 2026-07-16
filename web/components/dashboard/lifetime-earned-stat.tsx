import { getContributionSummary } from "@/lib/contributions-server";
import { formatHours } from "@/lib/contributions";
import { StatCard } from "@/components/dashboard/stat-card";

// Live confirmed lifetime-earned total from the Contribution Ledger,
// replacing the zero-state placeholder now that 3.1-3.5 have landed (PRD §10 Phase 3).
export async function LifetimeEarnedStat({ userId }: { userId: string }) {
  const { lifetimeEarned } = await getContributionSummary(userId);

  return (
    <StatCard
      label="Lifetime earned"
      value={formatHours(lifetimeEarned)}
      sublabel="Knowledge Hours"
      href="/contributions"
      linkLabel="View history"
    />
  );
}
