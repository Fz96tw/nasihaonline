import { Suspense } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { MemberCountStat } from "@/components/dashboard/member-count-stat";
import { Skeleton } from "@/components/ui/skeleton";

// Hours-balance, lifetime-earned, and sessions-contributed are static
// placeholders until the Contribution Ledger domain lands (PRD §10 Phase 3).
export function StatsRow() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Hours balance" value="—" sublabel="Coming soon" />
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
