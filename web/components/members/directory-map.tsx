"use client";

import "leaflet/dist/leaflet.css";
import "@/components/members/directory-map.css";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { animateNumber, prefersReducedMotion, useCountUp } from "@/lib/count-up";

export type MapBucket = {
  /** Unique marker id and selection key — a city ("city:<id>") or a country ("country:<ISO2>"). */
  key: string;
  /** Country the marker is in (used for the "across N countries" summary). */
  iso2: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
  /** Set only for a single-member marker whose member has a photo: the marker shows it instead of the count. */
  avatar?: { url: string; name: string } | null;
};

export type DirectoryMapProps = {
  buckets: MapBucket[];
  /** Key of the currently selected marker, or null when nothing is selected. */
  selected: string | null;
  /** Called with a marker's key when it is chosen, or null when the map background is clicked. */
  onSelect: (key: string | null) => void;
  /** Members in the current result set who have no plottable location. */
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
// A city is a much smaller target than a country, and at FLY_ZOOM its neighbours
// could still be clustered with it, so selecting a city flies in to the zoom
// where clustering switches off (CLUSTER_OFF_ZOOM).
const CITY_FLY_ZOOM = 5;
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
// Cities in the same region overlap badly at world zoom (a handful of cities in
// one country can sit within a few pixels of each other), so markers closer
// than CLUSTER_RADIUS_PX merge into one bubble showing their combined member
// count; zooming in splits it, and from CLUSTER_OFF_ZOOM every marker stands alone.
// (Hand-rolled rather than leaflet.markercluster: that plugin drops lone
// markers when the map's minZoom is fractional, which FitWorld makes it.)
const CLUSTER_RADIUS_PX = 42;
const CLUSTER_OFF_ZOOM = 5;
const COUNT_UP_MS = 800;

// A single-member marker showing a photo is a bit larger than the smallest
// count bubble (28px) so the face is recognisable.
const AVATAR_MARKER_SIZE = 38;

// Marker diameter grows with sqrt(count) so area tracks member count, clamped
// so one huge country can't swallow its neighbours.
function markerSize(count: number) {
  return Math.round(28 + Math.min(40, Math.sqrt(Math.max(count - 1, 0)) * 8));
}

type Cluster = { buckets: MapBucket[]; lat: number; lng: number; count: number };

// Greedy pixel-radius clustering at an integer zoom level, biggest markers
// first (buckets arrive sorted by count) so a cluster forms around the largest
// community and its centre is weighted by member count.
function clusterBuckets(map: L.Map, buckets: MapBucket[], level: number): Cluster[] {
  const alone = (bucket: MapBucket): Cluster => ({ buckets: [bucket], lat: bucket.lat, lng: bucket.lng, count: bucket.count });
  if (level >= CLUSTER_OFF_ZOOM) return buckets.map(alone);

  const groups: { buckets: MapBucket[]; count: number; x: number; y: number }[] = [];
  for (const bucket of buckets) {
    const point = map.project([bucket.lat, bucket.lng], level);
    const near = groups.find((group) => Math.hypot(group.x - point.x, group.y - point.y) < CLUSTER_RADIUS_PX);
    if (near) {
      const total = near.count + bucket.count;
      near.x = (near.x * near.count + point.x * bucket.count) / total;
      near.y = (near.y * near.count + point.y * bucket.count) / total;
      near.count = total;
      near.buckets.push(bucket);
    } else {
      groups.push({ buckets: [bucket], count: bucket.count, x: point.x, y: point.y });
    }
  }
  return groups.map((group) => {
    if (group.buckets.length === 1) return alone(group.buckets[0]);
    const center = map.unproject([group.x, group.y], level);
    return { buckets: group.buckets, lat: center.lat, lng: center.lng, count: group.count };
  });
}

function clusterLabel(cluster: Cluster) {
  return `${cluster.count} ${cluster.count === 1 ? "member" : "members"} in ${cluster.buckets.length} places, zoom in to see them`;
}

function clusterIcon(cluster: Cluster) {
  // Sized by members like a single marker, plus a little extra so it reads as a group.
  const size = markerSize(cluster.count) + 6;
  return L.divIcon({
    className: "dm-marker-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="dm-marker dm-cluster" style="width:${size}px;height:${size}px"><span class="dm-marker__count" aria-hidden="true">${cluster.count}</span></div>`,
  });
}

// A marker that's re-created because the zoom level changed (not because it's
// new to the map) shouldn't replay its pop-in.
function withoutEntrance(icon: L.DivIcon) {
  return L.divIcon({ ...icon.options, html: String(icon.options.html).replace(" dm-marker--enter", "") });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function memberLabel(bucket: MapBucket) {
  if (bucket.avatar) return `${bucket.avatar.name}, ${bucket.name}`;
  return `${bucket.name}, ${bucket.count} ${bucket.count === 1 ? "member" : "members"}`;
}

// Bigger communities breathe more slowly, and each marker starts at its own
// phase (derived from its key) so the whole map doesn't pulse in lockstep.
function pulseStyle(bucket: MapBucket) {
  const duration = 2.2 + Math.min(1.8, Math.sqrt(bucket.count) * 0.25);
  let hash = 0;
  for (let i = 0; i < bucket.key.length; i++) hash = (hash * 31 + bucket.key.charCodeAt(i)) % 251;
  const phase = (hash % 25) / 10;
  return `--dm-pulse:${duration.toFixed(2)}s;--dm-pulse-offset:-${phase.toFixed(1)}s`;
}

// The marker is a real <button> inside the Leaflet icon, so keyboard focus,
// Enter/Space activation and screen-reader semantics come from the browser.
// `popDelayMs` is set only for markers that are new to the map, which then
// scale in after that delay; markers that were already on it just re-render.
function buildIcon(bucket: MapBucket, selected: string | null, popDelayMs: number | null, pulses: boolean) {
  const size = bucket.avatar ? AVATAR_MARKER_SIZE : markerSize(bucket.count);
  const isSelected = bucket.key === selected;
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

  // The photo sits over the count; if it fails to load it removes itself and
  // the count bubble underneath takes over.
  const photo = bucket.avatar
    ? `<img class="dm-marker__photo" src="${escapeHtml(bucket.avatar.url)}" alt="" draggable="false" onerror="this.remove()">`
    : "";

  return L.divIcon({
    className: "dm-marker-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<button type="button" class="${classes}" data-key="${escapeHtml(bucket.key)}" aria-pressed="${isSelected}" aria-label="${escapeHtml(memberLabel(bucket))}" style="${style}"><span class="dm-marker__count" aria-hidden="true">${bucket.count}</span>${photo}</button>`,
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

// Clicks on the map itself (ocean, anywhere that isn't a marker) reset the
// place filter. Marker clicks never reach here — they stop propagation in the
// Marker handler below.
function BackgroundClick({ onSelect }: { onSelect: (key: string | null) => void }) {
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

// Owns the markers: at the current zoom level, nearby ones are merged into a
// cluster bubble (click to zoom in on its members). Must render BEFORE
// MapEffects, which reaches into the markers' DOM: effects run in tree order,
// so the markers exist by the time those effects run.
function ClusterLayer({
  buckets,
  icons,
  selected,
  onSelect,
  onRebuilt,
}: {
  buckets: MapBucket[];
  icons: L.DivIcon[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Called after the markers were re-created (the parent re-applies selection styling to them). */
  onRebuilt: () => void;
}) {
  const map = useMap();
  const [level, setLevel] = useState(() => Math.round(map.getZoom()));
  useMapEvents({ zoomend: () => setLevel(Math.round(map.getZoom())) });

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onRebuiltRef = useRef(onRebuilt);
  onRebuiltRef.current = onRebuilt;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const markers = useRef(new Map<string, L.Marker>());
  const lastIcons = useRef<L.DivIcon[] | null>(null);

  const clusters = useMemo(() => clusterBuckets(map, buckets, level), [map, buckets, level]);

  useEffect(() => {
    const isNewIconSet = lastIcons.current !== icons;
    lastIcons.current = icons;
    const iconByKey = new Map(buckets.map((bucket, index) => [bucket.key, icons[index]]));

    const layer = L.layerGroup();
    const byKey = new Map<string, L.Marker>();
    for (const cluster of clusters) {
      if (cluster.buckets.length === 1) {
        const [bucket] = cluster.buckets;
        const icon = iconByKey.get(bucket.key)!;
        const marker = L.marker([bucket.lat, bucket.lng], {
          icon: isNewIconSet ? icon : withoutEntrance(icon),
          keyboard: false,
          zIndexOffset: bucket.key === selectedRef.current ? 10000 : 0,
        });
        marker.on("click", (event) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          onSelectRef.current(bucket.key);
        });
        byKey.set(bucket.key, marker);
        layer.addLayer(marker);
      } else {
        const label = clusterLabel(cluster);
        const marker = L.marker([cluster.lat, cluster.lng], { icon: clusterIcon(cluster), title: label, alt: label });
        marker.on("click", (event) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          const bounds = L.latLngBounds(cluster.buckets.map((bucket) => [bucket.lat, bucket.lng] as L.LatLngTuple));
          map.fitBounds(bounds, { maxZoom: CLUSTER_OFF_ZOOM, padding: [60, 60], animate: !prefersReducedMotion() });
        });
        layer.addLayer(marker);
      }
    }
    markers.current = byKey;
    layer.addTo(map);
    onRebuiltRef.current();
    return () => {
      layer.remove();
    };
  }, [map, clusters, buckets, icons]);

  useEffect(() => {
    markers.current.forEach((marker, key) => marker.setZIndexOffset(key === selected ? 10000 : 0));
  }, [selected, clusters]);

  return null;
}

// Must render AFTER the ClusterLayer: it reaches into the markers' DOM, and
// effects run in tree order, so by the time these run they've been built.
//   * Fly-to: choosing a marker flies to it; clearing flies back out to the
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

    const target = selected ? bucketsRef.current.find((bucket) => bucket.key === selected) : null;
    if (selected && !target) return; // selected place has no marker under the current filters
    if (!selected && first) return; // nothing selected on open: FitWorld already framed the world

    const instant = first || prefersReducedMotion();
    const center: L.LatLngExpression = target ? [target.lat, target.lng] : DEFAULT_CENTER;
    const flyZoom = target?.key.startsWith("city:") ? CITY_FLY_ZOOM : FLY_ZOOM;
    const zoom = target
      ? Math.min(map.getMaxZoom(), Math.max(map.getZoom(), flyZoom))
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
        `button.dm-marker[data-key="${bucket.key}"] .dm-marker__count`,
      );
      if (!label) continue;
      running.current.get(bucket.key)?.();
      const from = shown.current.get(bucket.key) ?? 0;
      label.textContent = String(from);
      running.current.set(
        bucket.key,
        animateNumber(from, bucket.count, COUNT_UP_MS, (value) => {
          label.textContent = String(value);
          shown.current.set(bucket.key, value);
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
  // Markers are cities now, so several can share a country.
  const countries = useMemo(() => new Set(buckets.map((bucket) => bucket.iso2)).size, [buckets]);
  const animatedMembers = useCountUp(members, COUNT_UP_MS);
  const animatedCountries = useCountUp(countries, COUNT_UP_MS);

  // Screen readers get the settled sentence; the ticking one is hidden so they
  // aren't read every intermediate number.
  return (
    <p className="text-sm font-medium">
      <span className="sr-only">{summaryText(members, countries)}</span>
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

  // Bumped whenever the cluster layer re-creates its markers (zoom changed), so
  // the selection styling below is re-applied to the fresh DOM nodes.
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Only places that weren't on the map before get the pop-in, so typing in
  // the search box or changing a filter doesn't make every marker re-pop.
  const seen = useRef(new Set<string>());
  const icons = useMemo(() => {
    const entering = buckets
      .filter((bucket) => !seen.current.has(bucket.key))
      .sort((a, b) => b.count - a.count);
    const delays = new Map(
      entering.map((bucket, rank) => [bucket.key, Math.min(rank * POP_STAGGER_MS, POP_MAX_DELAY_MS)]),
    );
    const pulsing = new Set(
      [...buckets]
        .sort((a, b) => b.count - a.count)
        .slice(0, PULSE_MAX_MARKERS)
        .map((bucket) => bucket.key),
    );
    return buckets.map((bucket) =>
      buildIcon(bucket, selectedRef.current, delays.get(bucket.key) ?? null, pulsing.has(bucket.key)),
    );
  }, [buckets]);
  useEffect(() => {
    buckets.forEach((bucket) => seen.current.add(bucket.key));
  }, [buckets]);


  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLButtonElement>("button.dm-marker").forEach((button) => {
      const isSelected = button.dataset.key === selected;
      button.setAttribute("aria-pressed", String(isSelected));
      button.classList.toggle("dm-marker--selected", isSelected);
      button.classList.toggle("dm-marker--dim", selected !== null && !isSelected);
    });
  }, [selected, buckets, layoutVersion]);

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
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &middot; City data &copy; <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0)'
          />
          <FitWorld />
          <BackgroundClick onSelect={onSelect} />
          <ClusterLayer
            buckets={buckets}
            icons={icons}
            selected={selected}
            onSelect={onSelect}
            onRebuilt={() => setLayoutVersion((version) => version + 1)}
          />
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
