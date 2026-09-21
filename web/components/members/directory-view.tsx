"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { DirectoryGrid } from "@/components/members/directory-grid";
import { DirectoryMap, type MapBucket } from "@/components/members/directory-map-loader";
import { countryNameFor, memberPlace } from "@/lib/cities";
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
 * above the member grid. The map doubles as a place filter — picking a marker
 * narrows the grid to it, clicking the map elsewhere clears it. A marker is a
 * member's city when they've set one, otherwise their country.
 *
 * No server work is added for this: `DirectoryMember.city` and `countryRegion`
 * are already null for members who hid their location (lib/members-server.ts),
 * so they stay in the grid but simply can't be placed on the map.
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
  const selectedPlace = useDirectoryFilters((state) => state.selectedPlace);
  const setSelectedPlace = useDirectoryFilters((state) => state.setSelectedPlace);
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

  // Everything except the place: this is what the map counts, so the markers
  // always show how many members each place would contribute under the
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
    const byPlace = new Map<string, MapBucket>();
    let unmapped = 0;
    for (const member of baseFiltered) {
      const place = memberPlace(member);
      if (!place) {
        unmapped += 1;
        continue;
      }
      const bucket = byPlace.get(place.key);
      if (bucket) bucket.count += 1;
      else byPlace.set(place.key, { ...place, count: 1 });
    }
    return {
      buckets: Array.from(byPlace.values()).sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
      ),
      unmappedCount: unmapped,
    };
  }, [baseFiltered]);

  const filtered = useMemo(
    () =>
      selectedPlace
        ? baseFiltered.filter((member) => memberPlace(member)?.key === selectedPlace)
        : baseFiltered,
    [baseFiltered, selectedPlace],
  );

  // Clicking the already-selected marker again clears it, like a toggle chip.
  const handleSelect = useCallback(
    (key: string | null) => setSelectedPlace(key !== null && key === selectedPlace ? null : key),
    [selectedPlace, setSelectedPlace],
  );

  // Esc clears the place filter — unless the key is meant for something else:
  // a text field, or an open dialog/menu/popover that will use Esc to close.
  useEffect(() => {
    if (!selectedPlace) return;
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
      setSelectedPlace(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedPlace, setSelectedPlace]);

  // The chip's name comes from a member in the selection (the selected marker
  // can drop off the map when another filter empties it), falling back to the
  // country for a "country:XX" key.
  const selectedName = useMemo(() => {
    if (!selectedPlace) return null;
    for (const member of source) {
      const place = memberPlace(member);
      if (place?.key === selectedPlace) return place.name;
    }
    return selectedPlace.startsWith("country:") ? countryNameFor(selectedPlace.slice("country:".length)) : "this place";
  }, [source, selectedPlace]);

  return (
    <div className="flex flex-col gap-6">
      <DirectoryMap
        buckets={buckets}
        selected={selectedPlace}
        onSelect={handleSelect}
        unmappedCount={unmappedCount}
      />
      <DirectoryGrid
        members={filtered}
        isLoading={isLoading}
        currentUserId={currentUserId}
        summaryExtra={
          selectedPlace && (
            <button
              type="button"
              onClick={() => setSelectedPlace(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Showing {filtered.length} {filtered.length === 1 ? "member" : "members"} in {selectedName}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">, clear location filter</span>
            </button>
          )
        }
      />
    </div>
  );
}
