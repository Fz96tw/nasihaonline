"use client";

import "leaflet/dist/leaflet.css";
import "@/components/members/directory-map.css";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { animateNumber, prefersReducedMotion, useCountUp } from "@/lib/count-up";

export type MapBucket = {
  iso2: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
};

export type DirectoryMapProps = {
  buckets: MapBucket[];
  /** ISO2 of the currently selected country, or null when nothing is selected. */
  selected: string | null;
  /** Called with an ISO2 when a marker is chosen, or null when the map background is clicked. */
  onSelect: (iso2: string | null) => void;
  /** Members in the current result set who have no plottable country. */
  unmappedCount: number;
};

const WORLD_BOUNDS: L.LatLngBoundsLiteral = [
  [-85, -180],
  [85, 180],
];

// Slightly north of the equator so the inhabited latitudes (Iceland to New
// Zealand) sit inside the 420px desktop view, which crops the world vertically.
const DEFAULT_CENTER: L.LatLngTuple = [22, 10];

// Animation tuning (all of it is skipped under prefers-reduced-motion).
const FLY_ZOOM = 4;
const FLY_DURATION_S = 1.2;
// Newly appearing markers pop in largest-first, one every POP_STAGGER_MS, but
// the delay stops growing at POP_MAX_DELAY_MS so the whole entrance stays
// around a second no matter how many countries there are.
const POP_STAGGER_MS = 60;
const POP_MAX_DELAY_MS = 600;
// Every pulsing ring is its own compositor layer, and 200 of them cost ~3x the
// frame time in software rendering (measured with all 201 countries). Only the
// largest communities pulse; on a map with this many markers a ripple on every
// one would just be noise anyway.
const PULSE_MAX_MARKERS = 12;
const COUNT_UP_MS = 800;

// Marker diameter grows with sqrt(count) so area tracks member count, clamped
// so one huge country can't swallow its neighbours.
function markerSize(count: number) {
  return Math.round(28 + Math.min(40, Math.sqrt(Math.max(count - 1, 0)) * 8));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function memberLabel(name: string, count: number) {
  return `${name}, ${count} ${count === 1 ? "member" : "members"}`;
}

// Bigger communities breathe more slowly, and each marker starts at its own
// phase (derived from its code) so the whole map doesn't pulse in lockstep.
function pulseStyle(bucket: MapBucket) {
  const duration = 2.2 + Math.min(1.8, Math.sqrt(bucket.count) * 0.25);
  const phase = ((bucket.iso2.charCodeAt(0) + bucket.iso2.charCodeAt(1)) % 25) / 10;
  return `--dm-pulse:${duration.toFixed(2)}s;--dm-pulse-offset:-${phase.toFixed(1)}s`;
}

// The marker is a real <button> inside the Leaflet icon, so keyboard focus,
// Enter/Space activation and screen-reader semantics come from the browser.
// `popDelayMs` is set only for markers that are new to the map, which then
// scale in after that delay; markers that were already on it just re-render.
function buildIcon(bucket: MapBucket, selected: string | null, popDelayMs: number | null, pulses: boolean) {
  const size = markerSize(bucket.count);
  const isSelected = bucket.iso2 === selected;
  const classes = [
    "dm-marker",
    isSelected ? "dm-marker--selected" : "",
    selected !== null && !isSelected ? "dm-marker--dim" : "",
    popDelayMs !== null ? "dm-marker--enter" : "",
    pulses ? "dm-marker--pulse" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = [
    `width:${size}px`,
    `height:${size}px`,
    pulseStyle(bucket),
    popDelayMs !== null ? `--dm-delay:${popDelayMs}ms` : "",
  ]
    .filter(Boolean)
    .join(";");

  return L.divIcon({
    className: "dm-marker-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<button type="button" class="${classes}" data-iso="${escapeHtml(bucket.iso2)}" aria-pressed="${isSelected}" aria-label="${escapeHtml(memberLabel(bucket.name, bucket.count))}" style="${style}"><span class="dm-marker__count" aria-hidden="true">${bucket.count}</span></button>`,
  });
}

// The Web Mercator world is a 256 * 2^z px square, so it fills the container
// once 256 * 2^z reaches the larger container side. (Computed directly:
// getBoundsZoom clamps to the current minZoom and rounds up to the next
// zoomSnap step, both of which overshoot here.)
function worldFitZoom(map: L.Map) {
  const { x, y } = map.getSize();
  return Math.max(0, Math.log2(Math.max(x, y) / 256));
}

// Clicks on the map itself (ocean, other countries, anywhere that isn't a
// marker) reset the country filter. Marker clicks never reach here — they
// stop propagation in the Marker handler below.
function BackgroundClick({ onSelect }: { onSelect: (iso2: string | null) => void }) {
  useMapEvents({ click: () => onSelect(null) });
  return null;
}

// Keeps the minimum zoom at "the world exactly fills the container", so there
// are never empty bands beside or below the tiles — on a wide desktop map and
// on a phone alike. The map opens at that zoom (the whole world on a phone,
// the full width on desktop), and re-fits when the container resizes.
function FitWorld() {
  const map = useMap();

  useEffect(() => {
    const fit = (initial: boolean) => {
      const fitZoom = worldFitZoom(map);
      map.setMinZoom(fitZoom);
      if (initial) map.setView(DEFAULT_CENTER, fitZoom, { animate: false });
      else if (map.getZoom() < fitZoom) map.setZoom(fitZoom, { animate: false });
    };
    fit(true);
    const onResize = () => fit(false);
    map.on("resize", onResize);
    return () => {
      map.off("resize", onResize);
    };
  }, [map]);

  return null;
}

// Must render AFTER the <Marker>s: it reaches into their DOM, and effects run
// in tree order, so by the time these run react-leaflet has (re)built them.
//   * Fly-to: choosing a country flies to it; clearing flies back out to the
//     fitted world view. The first run (selection restored on page load) and
//     reduced-motion users get an instant jump instead.
//   * Count-up: each marker's number tweens from what it last showed (0 for a
//     marker that's new to the map) to its current count.
function MapEffects({ buckets, selected }: { buckets: MapBucket[]; selected: string | null }) {
  const map = useMap();

  const bucketsRef = useRef(buckets);
  bucketsRef.current = buckets;
  const lastSelected = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const first = lastSelected.current === undefined;
    if (!first && lastSelected.current === selected) return;
    lastSelected.current = selected;

    const target = selected ? bucketsRef.current.find((bucket) => bucket.iso2 === selected) : null;
    if (selected && !target) return; // selected country has no marker under the current filters
    if (!selected && first) return; // nothing selected on open: FitWorld already framed the world

    const instant = first || prefersReducedMotion();
    const center: L.LatLngExpression = target ? [target.lat, target.lng] : DEFAULT_CENTER;
    const zoom = target
      ? Math.min(map.getMaxZoom(), Math.max(map.getZoom(), FLY_ZOOM))
      : worldFitZoom(map);
    if (instant) map.setView(center, zoom, { animate: false });
    else map.flyTo(center, zoom, { duration: FLY_DURATION_S });
  }, [selected, map]);

  const shown = useRef(new Map<string, number>());
  const running = useRef(new Map<string, () => void>());

  useEffect(() => {
    const root = map.getContainer();
    for (const bucket of buckets) {
      const label = root.querySelector<HTMLElement>(
        `button.dm-marker[data-iso="${bucket.iso2}"] .dm-marker__count`,
      );
      if (!label) continue;
      running.current.get(bucket.iso2)?.();
      const from = shown.current.get(bucket.iso2) ?? 0;
      label.textContent = String(from);
      running.current.set(
        bucket.iso2,
        animateNumber(from, bucket.count, COUNT_UP_MS, (value) => {
          label.textContent = String(value);
          shown.current.set(bucket.iso2, value);
        }),
      );
    }
  }, [buckets, map]);

  useEffect(() => {
    const active = running.current;
    return () => active.forEach((cancel) => cancel());
  }, []);

  return null;
}

const summaryText = (members: number, countries: number) =>
  `${members} ${members === 1 ? "member" : "members"} across ${countries} ${countries === 1 ? "country" : "countries"}`;

// Its own component so the count-up's per-frame state changes re-render just
// this line, not the map and all of its markers.
function MapSummary({ buckets }: { buckets: MapBucket[] }) {
  const members = useMemo(() => buckets.reduce((sum, bucket) => sum + bucket.count, 0), [buckets]);
  const animatedMembers = useCountUp(members, COUNT_UP_MS);
  const animatedCountries = useCountUp(buckets.length, COUNT_UP_MS);

  // Screen readers get the settled sentence; the ticking one is hidden so they
  // aren't read every intermediate number.
  return (
    <p className="text-sm font-medium">
      <span className="sr-only">{summaryText(members, buckets.length)}</span>
      <span aria-hidden="true" data-testid="map-summary">
        {summaryText(animatedMembers, animatedCountries)}
      </span>
    </p>
  );
}

export function DirectoryMap({ buckets, selected, onSelect, unmappedCount }: DirectoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Icons are keyed on the buckets only, NOT on `selected`: rebuilding an icon
  // replaces its DOM node, which would drop keyboard focus from the marker the
  // user just activated. Selection styling is toggled in place by the effect
  // below; the ref just seeds a freshly built icon with the current selection.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Only countries that weren't on the map before get the pop-in, so typing in
  // the search box or changing a filter doesn't make every marker re-pop.
  const seen = useRef(new Set<string>());
  const icons = useMemo(() => {
    const entering = buckets
      .filter((bucket) => !seen.current.has(bucket.iso2))
      .sort((a, b) => b.count - a.count);
    const delays = new Map(
      entering.map((bucket, rank) => [bucket.iso2, Math.min(rank * POP_STAGGER_MS, POP_MAX_DELAY_MS)]),
    );
    const pulsing = new Set(
      [...buckets]
        .sort((a, b) => b.count - a.count)
        .slice(0, PULSE_MAX_MARKERS)
        .map((bucket) => bucket.iso2),
    );
    return buckets.map((bucket) =>
      buildIcon(bucket, selectedRef.current, delays.get(bucket.iso2) ?? null, pulsing.has(bucket.iso2)),
    );
  }, [buckets]);
  useEffect(() => {
    buckets.forEach((bucket) => seen.current.add(bucket.iso2));
  }, [buckets]);


  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLButtonElement>("button.dm-marker").forEach((button) => {
      const isSelected = button.dataset.iso === selected;
      button.setAttribute("aria-pressed", String(isSelected));
      button.classList.toggle("dm-marker--selected", isSelected);
      button.classList.toggle("dm-marker--dim", selected !== null && !isSelected);
    });
  }, [selected, buckets]);

  return (
    <div className="flex flex-col gap-2">
      <MapSummary buckets={buckets} />
      {/* isolate: Leaflet's panes/controls use z-indexes up to 1000, which
          would otherwise paint over the sticky header while scrolling. */}
      <div
        ref={containerRef}
        className="dm-map isolate h-[320px] w-full overflow-hidden rounded-[10px] border bg-muted md:h-[420px]"
      >
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={2}
          zoomSnap={0.25}
          maxZoom={7}
          maxBounds={WORLD_BOUNDS}
          maxBoundsViscosity={1}
          scrollWheelZoom={false}
          worldCopyJump={false}
          className="h-full w-full"
        >
          {/* OpenStreetMap's standard tiles need no API key (CARTO's public
              basemaps now do). Fine for a small members-only page; revisit the
              provider — see the OSM tile usage policy — if traffic grows.
              Dark mode is a CSS filter on the tile pane (directory-map.css). */}
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            noWrap
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <FitWorld />
          <BackgroundClick onSelect={onSelect} />
          {buckets.map((bucket, index) => (
            <Marker
              key={bucket.iso2}
              position={[bucket.lat, bucket.lng]}
              icon={icons[index]}
              keyboard={false}
              zIndexOffset={bucket.iso2 === selected ? 10000 : 0}
              eventHandlers={{
                click: (event) => {
                  L.DomEvent.stopPropagation(event.originalEvent);
                  onSelect(bucket.iso2);
                },
              }}
            />
          ))}
          <MapEffects buckets={buckets} selected={selected} />
        </MapContainer>
      </div>

      {unmappedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {unmappedCount} {unmappedCount === 1 ? "member isn't" : "members aren't"} shown on the map
          (location not shared or not recognized) but {unmappedCount === 1 ? "is" : "are"} still listed below.
        </p>
      )}
    </div>
  );
}
