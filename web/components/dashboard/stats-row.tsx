import { Suspense } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { MemberCountStat } from "@/components/dashboard/member-count-stat";
import { HoursBalanceStat } from "@/components/dashboard/hours-balance-stat";
import { Skeleton } from "@/components/ui/skeleton";

// Lifetime-earned and sessions-contributed are still static placeholders;
// Hours-balance now goes live from the Contribution Ledger (PRD §10 Phase 3).
export function StatsRow({ userId }: { userId: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Suspense fallback={<StatCardSkeleton />}>
        <HoursBalanceStat userId={userId} />
      </Suspense>
      <StatCard label="Lifetime earned" value="—" sublabel="Coming soon" />
      <StatCard label="Sessions contributed" value="—" sublabel="Coming soon" />
      <Suspense fallback={<StatCardSkeleton />}>
        <MemberCountStat />
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
