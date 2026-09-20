"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
  currentUserId,
  summaryExtra,
}: {
  members: DirectoryMember[];
  isLoading: boolean;
  currentUserId: string;
  summaryExtra?: ReactNode;
}) {
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
        <p className="py-16 text-center text-muted-foreground">No members match your search and filter.</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </div>
  );
}
