"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { DirectoryGrid } from "@/components/members/directory-grid";
import { MemberCard } from "@/components/members/member-card";
import { MemberCount, RECOMMENDATION_SECTIONS, RecommendationPane } from "@/components/members/recommendation-sections";
import { PaneSlider, type Pane } from "@/components/shared/pane-slider";
import { cn } from "@/lib/utils";
import { DirectoryMap, type MapBucket } from "@/components/members/directory-map-loader";
import { countryNameFor, memberPlace } from "@/lib/cities";
import { type DirectoryMember, type DirectoryRecommendations } from "@/lib/members";
import { useDirectoryFilters } from "@/lib/stores/directory-filters";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 250;

const ALL_PANE = "all";
const MY_PEOPLE_PANE = "my-people";
// ?pane= values the Directory honors on load (the recommendation panes use their DirectoryRecommendations key).
const PANE_PARAM: Record<string, string> = { "my-people": MY_PEOPLE_PANE };

// The small pane lists are searched in the browser (the All pane asks the
// server): every word must appear somewhere in the member's public details.
function matchesSearch(member: DirectoryMember, query: string) {
  if (!query) return true;
  const haystack = [
    member.name,
    member.titleSpecialty,
    member.countryRegion,
    member.city?.name,
    member.careerStage,
    member.bio,
    member.learningTopics,
    ...member.expertiseAreas,
    ...member.skills.map((skill) => skill.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

async function fetchDirectoryMembers(query: string): Promise<DirectoryMember[]> {
  const response = await fetch(`/api/members${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  if (!response.ok) throw new Error("Failed to load the member directory");
  const data = (await response.json()) as { members: DirectoryMember[] };
  return data.members;
}

/**
 * The directory's results area: a world map above a sliding panel of panes
 * (All members, the recommendation lists, My people). The map follows the pane
 * in view — it plots only that pane's members — and doubles as a place filter:
 * picking a marker narrows the list below to it (the map keeps the pane's other
 * places so another can be clicked), clicking the map elsewhere clears it. A
 * marker is a member's city when they've set one, otherwise their country.
 *
 * No server work is added for this: `DirectoryMember.city` and `countryRegion`
 * are already null for members who hid their location (lib/members-server.ts),
 * so they stay in the grid but simply can't be placed on the map.
 */
export function DirectoryView({
  initialMembers,
  recommendations,
  myPeople,
  initialPane,
  currentUserId,
}: {
  initialMembers: DirectoryMember[];
  recommendations: DirectoryRecommendations;
  /** The viewer's own follow list (private; server-rendered via getMyPeople). */
  myPeople: DirectoryMember[];
  /** ?pane= from the URL; ignored when that pane isn't shown. */
  initialPane?: string;
  currentUserId: string;
}) {
  const search = useDirectoryFilters((state) => state.search);
  const tier = useDirectoryFilters((state) => state.tier);
  const skillIds = useDirectoryFilters((state) => state.skillIds);
  const interestAreas = useDirectoryFilters((state) => state.interestAreas);
  const openTo = useDirectoryFilters((state) => state.openTo);
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

  // Panes: recommendation panes appear only with members, My people only when
  // the viewer follows someone.
  const paneMembers = useMemo(
    () => ({
      [ALL_PANE]: source,
      ...Object.fromEntries(RECOMMENDATION_SECTIONS.map(({ key }) => [key, recommendations[key]])),
      [MY_PEOPLE_PANE]: myPeople,
    }),
    [source, recommendations, myPeople],
  ) as Record<string, DirectoryMember[]>;
  const paneIds = useMemo(
    () => [
      ALL_PANE,
      ...RECOMMENDATION_SECTIONS.filter(({ key }) => recommendations[key].length > 0).map(({ key }) => key),
      ...(myPeople.length > 0 ? [MY_PEOPLE_PANE] : []),
    ],
    [recommendations, myPeople],
  );
  const [pane, setPane] = useState(() => {
    const wanted = initialPane ? (PANE_PARAM[initialPane] ?? initialPane) : ALL_PANE;
    return paneIds.includes(wanted) ? wanted : ALL_PANE;
  });
  const activePane = paneIds.includes(pane) ? pane : ALL_PANE;

  // Everything except the place, per pane: this is what the map counts, so the
  // markers always show how many members each place would contribute under the
  // current search / tier / skill / interest-area filters. The All pane's list
  // is already searched by the server; the others are searched here.
  const baseByPane = useMemo(() => {
    const result: Record<string, DirectoryMember[]> = {};
    for (const id of paneIds) {
      result[id] = paneMembers[id].filter((member) => {
        if (id !== ALL_PANE && !matchesSearch(member, debouncedSearch)) return false;
        if (tier !== "all" && member.tier !== tier) return false;
        if (skillIds.length > 0 && !member.skills.some((skill) => skillIds.includes(skill.id))) return false;
        if (
          interestAreas.length > 0 &&
          !member.interestAreas.some((area) => interestAreas.includes(area))
        )
          return false;
        if (openTo.length > 0 && !member.openTo.some((tag) => openTo.includes(tag))) return false;
        return true;
      });
    }
    return result;
  }, [paneIds, paneMembers, debouncedSearch, tier, skillIds, interestAreas, openTo]);
  const baseFiltered = baseByPane[activePane];

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
      if (bucket) {
        bucket.count += 1;
        bucket.avatar = null; // more than one member: back to a plain count
      } else {
        byPlace.set(place.key, {
          ...place,
          count: 1,
          avatar: member.avatarUrl ? { url: member.avatarUrl, name: member.name ?? "NASIHA Member" } : null,
        });
      }
    }
    return {
      buckets: Array.from(byPlace.values()).sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
      ),
      unmappedCount: unmapped,
    };
  }, [baseFiltered]);

  const placeFilter = useCallback(
    (list: DirectoryMember[]) =>
      selectedPlace ? list.filter((member) => memberPlace(member)?.key === selectedPlace) : list,
    [selectedPlace],
  );
  const filtered = useMemo(() => placeFilter(baseFiltered), [placeFilter, baseFiltered]);

  // Switching panes keeps the place pick only if the new pane has members
  // there. A pick cleared this way mustn't fly the map back out: the map keeps
  // its position and zoom across panes (only the markers change).
  const keepMapView = useRef(false);
  const handlePaneChange = useCallback(
    (next: string) => {
      setPane(next);
      if (selectedPlace && !baseByPane[next]?.some((member) => memberPlace(member)?.key === selectedPlace)) {
        keepMapView.current = true;
        setSelectedPlace(null);
      }
    },
    [selectedPlace, baseByPane, setSelectedPlace],
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

  const isFiltering =
    search.trim() !== "" ||
    tier !== "all" ||
    skillIds.length > 0 ||
    interestAreas.length > 0 ||
    openTo.length > 0 ||
    selectedPlace !== null;

  const placeChip = selectedPlace && (
    <button
      type="button"
      onClick={() => setSelectedPlace(null)}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Showing {filtered.length} {filtered.length === 1 ? "member" : "members"} in {selectedName}
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">, clear location filter</span>
    </button>
  );

  const emptyHint = isFiltering
    ? "No one here matches your current search and filters."
    : "There is no one to show here yet.";

  const panes: Pane[] = paneIds.map((id) => {
    if (id === ALL_PANE) {
      return {
        id,
        label: "All members",
        content: (
          <section aria-labelledby="pane-all" className="flex flex-col gap-3">
            <div>
              <h2 id="pane-all" className="text-lg font-bold">
                All members
              </h2>
              <p className="text-sm text-muted-foreground">
                Everyone in the Directory. Search or filter above to narrow the list.
              </p>
            </div>
            <DirectoryGrid
              members={filtered}
              currentUserId={currentUserId}
              isLoading={isLoading}
              isFiltering={isFiltering}
              summaryExtra={placeChip}
            />
          </section>
        ),
      };
    }
    if (id === MY_PEOPLE_PANE) {
      const list = placeFilter(baseByPane[id]);
      return {
        id,
        label: "My people",
        content: (
          <section aria-labelledby="pane-my-people" className="flex flex-col gap-3">
            <div>
              <h2 id="pane-my-people" className="text-lg font-bold">
                My people
              </h2>
              <p className="text-sm text-muted-foreground">
                Members you&apos;ve followed, for one-click access. Only you can see this list.
              </p>
            </div>
            <MemberCount count={list.length} extra={placeChip} />
            {list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground" role="status">
                {emptyHint}
              </p>
            ) : (
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map((member) => (
                  <MemberCard key={member.id} member={member} currentUserId={currentUserId} />
                ))}
              </div>
            )}
          </section>
        ),
      };
    }
    const section = RECOMMENDATION_SECTIONS.find(({ key }) => key === id)!;
    return {
      id,
      label: section.tabLabel,
      content: (
        <RecommendationPane
          sectionKey={section.key}
          recommendations={recommendations}
          members={placeFilter(baseByPane[id])}
          currentUserId={currentUserId}
          emptyHint={emptyHint}
          summaryExtra={placeChip}
        />
      ),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <DirectoryMap
        buckets={buckets}
        selected={selectedPlace}
        onSelect={handleSelect}
        unmappedCount={unmappedCount}
        keepViewOnClear={keepMapView}
      />
      <PaneSlider
        idPrefix="directory"
        tabsLabel="Member lists"
        panes={panes}
        value={activePane}
        onValueChange={handlePaneChange}
        chevronOffsets={["-left-7", "-right-7"]}
        tabListClassName="-mt-2 flex gap-1 overflow-x-auto overflow-y-hidden border-b"
        tabClassName={(selected) =>
          cn(
            "-mb-px flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )
        }
      />
    </div>
  );
}
