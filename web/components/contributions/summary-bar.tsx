import { StatCard } from "@/components/dashboard/stat-card";
import type { ContributionSummary } from "@/lib/contributions";

function decimalsFor(hours: number): number {
  return hours % 1 === 0 ? 0 : 1;
}

export function ContributionsSummaryBar({ summary }: { summary: ContributionSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Confirmed balance"
        numericValue={summary.balance}
        decimals={decimalsFor(summary.balance)}
        sublabel="Knowledge Hours"
      />
      <StatCard
        label="Lifetime earned"
        numericValue={summary.lifetimeEarned}
        decimals={decimalsFor(summary.lifetimeEarned)}
        sublabel="Knowledge Hours"
      />
      <StatCard
        label="Lifetime spent"
        numericValue={summary.lifetimeSpent}
        decimals={decimalsFor(summary.lifetimeSpent)}
        sublabel="Knowledge Hours"
      />
    </div>
  );
}
