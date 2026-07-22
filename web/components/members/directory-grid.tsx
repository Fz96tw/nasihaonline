"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberCard } from "@/components/members/member-card";
import { type DirectoryMember } from "@/lib/members";
import { useDirectoryFilters } from "@/lib/stores/directory-filters";

const SEARCH_DEBOUNCE_MS = 250;

async function fetchDirectoryMembers(query: string): Promise<DirectoryMember[]> {
  const response = await fetch(`/api/members${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  if (!response.ok) throw new Error("Failed to load the member directory");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

/** Debounces the store's live search value so keystrokes don't each trigger a Meilisearch round trip (§9). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

export function DirectoryGrid({
  initialMembers,
  currentUserId,
}: {
  initialMembers: DirectoryMember[];
  currentUserId: string;
}) {
  const search = useDirectoryFilters((state) => state.search);
  const tier = useDirectoryFilters((state) => state.tier);
  const skillIds = useDirectoryFilters((state) => state.skillIds);
  const interestAreas = useDirectoryFilters((state) => state.interestAreas);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const { data: members, isLoading } = useQuery({
    queryKey: ["directory-members", debouncedSearch],
    queryFn: () => fetchDirectoryMembers(debouncedSearch),
    initialData: debouncedSearch ? undefined : initialMembers,
  });

  const filtered = useMemo(() => {
    if (!members) return [];
    return members.filter((member) => {
      if (tier !== "all" && member.tier !== tier) return false;
      if (skillIds.length > 0 && !member.skills.some((skill) => skillIds.includes(skill.id))) return false;
      if (
        interestAreas.length > 0 &&
        !member.interestAreas.some((area) => interestAreas.includes(area))
      )
        return false;
      return true;
    });
  }, [members, tier, skillIds, interestAreas]);

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
      <p className="text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "member" : "members"} found
      </p>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">No members match your search and filter.</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((member) => (
            <MemberCard key={member.id} member={member} currentUserId={currentUserId} />
          ))}
        </div>
      )}
    </div>
  );
}
