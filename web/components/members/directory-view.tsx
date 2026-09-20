"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { DirectoryGrid } from "@/components/members/directory-grid";
import { DirectoryMap, type MapBucket } from "@/components/members/directory-map-loader";
import { getCountryByIso2, resolveCountry } from "@/lib/country-centroids";
import { type DirectoryMember } from "@/lib/members";
import { useDirectoryFilters } from "@/lib/stores/directory-filters";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 250;

async function fetchDirectoryMembers(query: string): Promise<DirectoryMember[]> {
  const response = await fetch(`/api/members${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  if (!response.ok) throw new Error("Failed to load the member directory");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

/**
 * The directory's results area: a world map of where the listed members are,
 * above the member grid. The map doubles as a country filter — picking a
 * country narrows the grid, clicking the map elsewhere clears it.
 *
 * No server work is added for this: `DirectoryMember.countryRegion` is already
 * null for members who hid their location (lib/members-server.ts), so they
 * stay in the grid but simply can't be placed on the map.
 */
export function DirectoryView({
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
  const selectedCountry = useDirectoryFilters((state) => state.selectedCountry);
  const setSelectedCountry = useDirectoryFilters((state) => state.setSelectedCountry);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const { data: members, isLoading } = useQuery({
    queryKey: ["directory-members", debouncedSearch],
    queryFn: () => fetchDirectoryMembers(debouncedSearch),
    initialData: debouncedSearch ? undefined : initialMembers,
  });

  // While a new search is in flight `members` is undefined (the grid shows its
  // skeleton); hold the last result so the map's markers don't vanish and
  // reappear on every keystroke.
  const lastMembers = useRef(initialMembers);
  if (members) lastMembers.current = members;
  const source = members ?? lastMembers.current;

  // Everything except the country: this is what the map counts, so the markers
  // always show how many members each country would contribute under the
  // current search / tier / skill / interest-area filters.
  const baseFiltered = useMemo(
    () =>
      source.filter((member) => {
        if (tier !== "all" && member.tier !== tier) return false;
        if (skillIds.length > 0 && !member.skills.some((skill) => skillIds.includes(skill.id))) return false;
        if (
          interestAreas.length > 0 &&
          !member.interestAreas.some((area) => interestAreas.includes(area))
        )
          return false;
        return true;
      }),
    [source, tier, skillIds, interestAreas],
  );

  const { buckets, unmappedCount } = useMemo(() => {
    const byCountry = new Map<string, MapBucket>();
    let unmapped = 0;
    for (const member of baseFiltered) {
      const country = resolveCountry(member.countryRegion);
      if (!country) {
        unmapped += 1;
        continue;
      }
      const bucket = byCountry.get(country.iso2);
      if (bucket) bucket.count += 1;
      else
        byCountry.set(country.iso2, {
          iso2: country.iso2,
          name: country.name,
          lat: country.lat,
          lng: country.lng,
          count: 1,
        });
    }
    return {
      buckets: Array.from(byCountry.values()).sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
      ),
      unmappedCount: unmapped,
    };
  }, [baseFiltered]);

  const filtered = useMemo(
    () =>
      selectedCountry
        ? baseFiltered.filter((member) => resolveCountry(member.countryRegion)?.iso2 === selectedCountry)
        : baseFiltered,
    [baseFiltered, selectedCountry],
  );

  // Clicking the already-selected country again clears it, like a toggle chip.
  const handleSelect = useCallback(
    (iso2: string | null) => setSelectedCountry(iso2 !== null && iso2 === selectedCountry ? null : iso2),
    [selectedCountry, setSelectedCountry],
  );

  // Esc clears the country filter — unless the key is meant for something else:
  // a text field, or an open dialog/menu/popover that will use Esc to close.
  useEffect(() => {
    if (!selectedCountry) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
        )
      )
        return;
      setSelectedCountry(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedCountry, setSelectedCountry]);

  const selectedName = getCountryByIso2(selectedCountry)?.name ?? selectedCountry;

  return (
    <div className="flex flex-col gap-6">
      <DirectoryMap
        buckets={buckets}
        selected={selectedCountry}
        onSelect={handleSelect}
        unmappedCount={unmappedCount}
      />
      <DirectoryGrid
        members={filtered}
        isLoading={isLoading}
        currentUserId={currentUserId}
        summaryExtra={
          selectedCountry && (
            <button
              type="button"
              onClick={() => setSelectedCountry(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Showing {filtered.length} {filtered.length === 1 ? "member" : "members"} in {selectedName}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">, clear country filter</span>
            </button>
          )
        }
      />
    </div>
  );
}
