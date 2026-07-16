import { getConfirmedEarnedSessionCount } from "@/lib/contributions-server";
import { StatCard } from "@/components/dashboard/stat-card";

// Live confirmed session count from the Contribution Ledger, replacing the
// zero-state placeholder now that 3.1-3.5 have landed (PRD §10 Phase 3).
export async function SessionsContributedStat({ userId }: { userId: string }) {
  const count = await getConfirmedEarnedSessionCount(userId);

  return (
    <StatCard
      label="Sessions contributed"
      value={String(count)}
      sublabel="Confirmed contributions"
      href="/contributions"
      linkLabel="View history"
    />
  );
}
