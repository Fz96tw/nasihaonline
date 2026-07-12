"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberCard } from "@/components/members/member-card";
import { matchesDirectorySearch, type DirectoryMember } from "@/lib/members";
import { useDirectoryFilters } from "@/lib/stores/directory-filters";

async function fetchDirectoryMembers(): Promise<DirectoryMember[]> {
  const response = await fetch("/api/members");
  if (!response.ok) throw new Error("Failed to load the member directory");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

export function DirectoryGrid({ initialMembers }: { initialMembers: DirectoryMember[] }) {
  const search = useDirectoryFilters((state) => state.search);
  const tier = useDirectoryFilters((state) => state.tier);

  const { data: members, isLoading } = useQuery({
    queryKey: ["directory-members"],
    queryFn: fetchDirectoryMembers,
    initialData: initialMembers,
  });

  const filtered = useMemo(() => {
    return members.filter(
      (member) =>
        (tier === "all" || member.tier === tier) && matchesDirectorySearch(member, search),
    );
  }, [members, search, tier]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-56 rounded-[10px]" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        No members match your search and filter.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((member) => (
        <MemberCard key={member.id} member={member} />
      ))}
    </div>
  );
}
