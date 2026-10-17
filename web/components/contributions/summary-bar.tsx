import { StatCard } from "@/components/dashboard/stat-card";
import { hoursDecimals, type ContributionSummary } from "@/lib/contributions";

export function ContributionsSummaryBar({ summary }: { summary: ContributionSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Confirmed balance"
        numericValue={summary.balance}
        decimals={hoursDecimals(summary.balance)}
        sublabel="Knowledge Hours"
      />
      <StatCard
        label="Lifetime earned"
        numericValue={summary.lifetimeEarned}
        decimals={hoursDecimals(summary.lifetimeEarned)}
        sublabel="Knowledge Hours"
      />
      <StatCard
        label="Lifetime spent"
        numericValue={summary.lifetimeSpent}
        decimals={hoursDecimals(summary.lifetimeSpent)}
        sublabel="Knowledge Hours"
      />
    </div>
  );
}
