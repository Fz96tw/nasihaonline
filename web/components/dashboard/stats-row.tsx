import { Suspense } from "react";
import { HoursBalanceStat } from "@/components/dashboard/hours-balance-stat";
import { LifetimeEarnedStat } from "@/components/dashboard/lifetime-earned-stat";
import { SessionsContributedStat } from "@/components/dashboard/sessions-contributed-stat";
import { Skeleton } from "@/components/ui/skeleton";

// All three stats now go live from the Contribution Ledger (PRD §10 Phase 3).
export function StatsRow({ userId }: { userId: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Suspense fallback={<StatCardSkeleton />}>
        <HoursBalanceStat userId={userId} />
      </Suspense>
      <Suspense fallback={<StatCardSkeleton />}>
        <LifetimeEarnedStat userId={userId} />
      </Suspense>
      <Suspense fallback={<StatCardSkeleton />}>
        <SessionsContributedStat userId={userId} />
      </Suspense>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-[10px] border bg-card p-6 shadow-sm">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-16" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}
