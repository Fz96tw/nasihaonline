"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DIRECTORY_TIERS, DIRECTORY_TIER_LABELS } from "@/lib/members";
import { useDirectoryFilters, type DirectoryTierFilter } from "@/lib/stores/directory-filters";
import { SkillFilter } from "@/components/members/skill-filter";

export function DirectoryFiltersBar({ availableSkills }: { availableSkills: { id: string; name: string }[] }) {
  const search = useDirectoryFilters((state) => state.search);
  const setSearch = useDirectoryFilters((state) => state.setSearch);
  const tier = useDirectoryFilters((state) => state.tier);
  const setTier = useDirectoryFilters((state) => state.setTier);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, title, country, or expertise…"
          className="pl-9"
          aria-label="Search the member directory"
        />
      </div>

      <Select
        value={tier}
        onValueChange={(value) => setTier(value as DirectoryTierFilter)}
      >
        <SelectTrigger className="sm:w-56" aria-label="Filter by tier">
          <SelectValue placeholder="All tiers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tiers</SelectItem>
          {DIRECTORY_TIERS.map((value) => (
            <SelectItem key={value} value={value}>
              {DIRECTORY_TIER_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <SkillFilter options={availableSkills} />
    </div>
  );
}
