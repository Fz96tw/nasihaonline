import { StatCard } from "@/components/dashboard/stat-card";
import { LogContributionDialog } from "@/components/contributions/log-contribution-dialog";
import type { ContributionRuleOption, ContributionSummary } from "@/lib/contributions";

function decimalsFor(hours: number): number {
  return hours % 1 === 0 ? 0 : 1;
}

export function ContributionsSummaryBar({
  summary,
  rules,
}: {
  summary: ContributionSummary;
  rules: ContributionRuleOption[];
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
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
      <div className="sm:pt-1">
        <LogContributionDialog rules={rules} />
      </div>
    </div>
  );
}
