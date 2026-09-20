"use client";

import "leaflet/dist/leaflet.css";
import "@/components/members/directory-map.css";
import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

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

// The marker is a real <button> inside the Leaflet icon, so keyboard focus,
// Enter/Space activation and screen-reader semantics come from the browser.
function buildIcon(bucket: MapBucket, selected: string | null) {
  const size = markerSize(bucket.count);
  const isSelected = bucket.iso2 === selected;
  const classes = [
    "dm-marker",
    isSelected ? "dm-marker--selected" : "",
    selected !== null && !isSelected ? "dm-marker--dim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return L.divIcon({
    className: "dm-marker-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<button type="button" class="${classes}" data-iso="${escapeHtml(bucket.iso2)}" aria-pressed="${isSelected}" aria-label="${escapeHtml(memberLabel(bucket.name, bucket.count))}" style="width:${size}px;height:${size}px"><span aria-hidden="true">${bucket.count}</span></button>`,
  });
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
      // The Web Mercator world is a 256 * 2^z px square, so it fills the
      // container once 256 * 2^z reaches the larger container side. (Computed
      // directly: getBoundsZoom clamps to the current minZoom and rounds up to
      // the next zoomSnap step, both of which overshoot here.)
      const { x, y } = map.getSize();
      const fitZoom = Math.max(0, Math.log2(Math.max(x, y) / 256));
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

export function DirectoryMap({ buckets, selected, onSelect, unmappedCount }: DirectoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Icons are keyed on the buckets only, NOT on `selected`: rebuilding an icon
  // replaces its DOM node, which would drop keyboard focus from the marker the
  // user just activated. Selection styling is toggled in place by the effect
  // below; the ref just seeds a freshly built icon with the current selection.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const icons = useMemo(
    () => buckets.map((bucket) => buildIcon(bucket, selectedRef.current)),
    [buckets],
  );

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
