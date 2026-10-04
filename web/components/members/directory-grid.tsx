"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDirectoryFilters } from "@/lib/stores/directory-filters";
import { MemberCard } from "@/components/members/member-card";
import { type DirectoryMember } from "@/lib/members";

/**
 * The member cards for an already-filtered list — data fetching and filtering
 * live in DirectoryView. `summaryExtra` sits next to the "N members found"
 * line (used for the active-country chip).
 */
export function DirectoryGrid({
  members,
  isLoading,
  isFiltering,
  summaryExtra,
}: {
  members: DirectoryMember[];
  isLoading: boolean;
  /** True when a search/filter/map pick is active — the no-results state offers to clear it. */
  isFiltering: boolean;
  summaryExtra?: ReactNode;
}) {
  const resetFilters = useDirectoryFilters((state) => state.resetFilters);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-[10px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? "member" : "members"} found
        </p>
        {summaryExtra}
      </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center" role="status">
          <p className="text-lg font-semibold">No members found</p>
          <p className="max-w-md text-muted-foreground">
            {isFiltering
              ? "No one matches your current search and filters. Try a different name or fewer filters."
              : "There are no members to show in the Directory yet."}
          </p>
          {isFiltering && (
            <Button variant="outline" onClick={resetFilters}>
              Clear search and filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Open a profile to message someone or request a 1:1.
          </p>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {members.map((member) => (
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
