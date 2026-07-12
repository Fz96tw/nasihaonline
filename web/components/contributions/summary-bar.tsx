import { StatCard } from "@/components/dashboard/stat-card";
import { LogContributionDialog } from "@/components/contributions/log-contribution-dialog";
import { type ContributionRuleOption, type ContributionSummary } from "@/lib/contributions";

function formatHours(hours: number): string {
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}`;
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
        <StatCard label="Confirmed balance" value={formatHours(summary.balance)} sublabel="Knowledge Hours" />
        <StatCard label="Lifetime earned" value={formatHours(summary.lifetimeEarned)} sublabel="Knowledge Hours" />
        <StatCard label="Lifetime spent" value={formatHours(summary.lifetimeSpent)} sublabel="Knowledge Hours" />
      </div>
      <div className="sm:pt-1">
        <LogContributionDialog rules={rules} />
      </div>
    </div>
  );
}
