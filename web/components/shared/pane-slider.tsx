"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Horizontal drag past this fraction of the width (or a quick flick) commits the swipe.
const SWIPE_COMMIT_FRACTION = 0.25;
const SWIPE_COMMIT_VELOCITY = 0.4; // px per ms
// Don't treat a touch as a swipe until it has moved this far, mostly sideways.
const SWIPE_INTENT_PX = 10;

export type Pane = {
  id: string;
  label: ReactNode;
  /** Plain-text name for the chevrons' accessible labels ("Show Following"). Defaults to `label` when it is a string. */
  ariaLabel?: string;
  content: ReactNode;
};

export type PaneSliderTabs = {
  /** The tablist, ready to place wherever the caller's layout wants it. */
  tabs: ReactNode;
  active: string;
};

const defaultTabListClassName = "flex flex-shrink-0 rounded-full border bg-muted p-0.5";
const defaultTabClassName = (selected: boolean) =>
  cn(
    "rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
  );

/**
 * Any number of panes that slide sideways. The tabs are the real, always
 * visible control; edge chevrons (desktop) and touch swipe (phones) are
 * shortcuts. Off-screen panes are inert and aria-hidden, the container is as
 * tall as the active pane, and every animation is skipped under
 * prefers-reduced-motion (the motion-safe: variants).
 *
 * Panes may come and go between renders; if the active one disappears the
 * first pane is shown. Works controlled (`value` + `onValueChange`) or
 * uncontrolled (`defaultValue`).
 */
export function PaneSlider({
  panes,
  idPrefix,
  tabsLabel,
  value,
  defaultValue,
  onValueChange,
  renderTabs,
  tabListClassName = defaultTabListClassName,
  tabClassName = defaultTabClassName,
  chevronOffsets = ["-left-12", "-right-12"],
  paneClassName = "flex flex-col gap-6",
  showDots = true,
}: {
  panes: Pane[];
  /** Prefix for the tab/panel DOM ids — must be unique on the page. */
  idPrefix: string;
  tabsLabel: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Lays out the tablist. Defaults to the tablist on its own, above the dots. */
  renderTabs?: (args: PaneSliderTabs) => ReactNode;
  tabListClassName?: string;
  tabClassName?: (selected: boolean) => string;
  /** [left, right] Tailwind offsets of the desktop chevrons. */
  chevronOffsets?: [string, string];
  paneClassName?: string;
  showDots?: boolean;
}) {
  const [internal, setInternal] = useState(defaultValue ?? panes[0]?.id);
  const requested = value ?? internal;
  const found = panes.findIndex((pane) => pane.id === requested);
  const index = found === -1 ? 0 : found;
  const active = panes[index]?.id;
  const count = panes.length;

  const [dragX, setDragX] = useState<number | null>(null);
  // Height only animates while switching panes — never when a pane's own
  // content grows (e.g. a feed finishing its first load).
  const [switching, setSwitching] = useState(false);
  const [heights, setHeights] = useState<Record<string, number | undefined>>({});
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; dragging: boolean } | null>(null);

  const idsKey = panes.map((pane) => pane.id).join("|");

  // The container is as tall as the active pane (not the tallest), so there is
  // no blank gap below a short pane.
  useEffect(() => {
    const observers = idsKey.split("|").map((id) => {
      const element = paneRefs.current[id];
      if (!element) return null;
      const observer = new ResizeObserver(() => setHeights((prev) => ({ ...prev, [id]: element.offsetHeight })));
      observer.observe(element);
      return observer;
    });
    return () => observers.forEach((observer) => observer?.disconnect());
  }, [idsKey]);

  // Off-screen panes are unreachable by keyboard/screen reader.
  useEffect(() => {
    for (const { id } of panes) {
      const element = paneRefs.current[id];
      if (!element) continue;
      element.toggleAttribute("inert", id !== active);
      element.setAttribute("aria-hidden", String(id !== active));
    }
  }, [panes, active]);

  const switchTimer = useRef<ReturnType<typeof setTimeout>>();
  const go = useCallback(
    (id: string) => {
      if (id === active) return;
      setSwitching(true);
      clearTimeout(switchTimer.current);
      switchTimer.current = setTimeout(() => setSwitching(false), 350);
      setInternal(id);
      onValueChange?.(id);
    },
    [active, onValueChange],
  );
  useEffect(() => () => clearTimeout(switchTimer.current), []);

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let target: number;
    if (event.key === "ArrowRight") target = Math.min(index + 1, count - 1);
    else if (event.key === "ArrowLeft") target = Math.max(index - 1, 0);
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = count - 1;
    else return;
    event.preventDefault();
    const id = panes[target].id;
    go(id);
    tabRefs.current[id]?.focus();
  }

  function onTouchStart(event: TouchEvent) {
    // Leave the pill/tab rows (and anything else marked) to scroll on their own.
    if ((event.target as Element).closest("[data-no-swipe]")) return;
    const point = event.touches[0];
    touch.current = { x: point.clientX, y: point.clientY, t: Date.now(), dragging: false };
  }

  function onTouchMove(event: TouchEvent) {
    const state = touch.current;
    if (!state) return;
    const point = event.touches[0];
    const dx = point.clientX - state.x;
    const dy = point.clientY - state.y;
    if (!state.dragging) {
      if (Math.abs(dx) < SWIPE_INTENT_PX || Math.abs(dx) < Math.abs(dy) * 1.5) {
        // Vertical scroll in progress — not a swipe.
        if (Math.abs(dy) > SWIPE_INTENT_PX) touch.current = null;
        return;
      }
      state.dragging = true;
    }
    // Resist dragging past either end.
    const atStart = index === 0 && dx > 0;
    const atEnd = index === count - 1 && dx < 0;
    setDragX(atStart || atEnd ? dx / 4 : dx);
  }

  function onTouchEnd() {
    const state = touch.current;
    touch.current = null;
    if (!state?.dragging || dragX === null) {
      setDragX(null);
      return;
    }
    const width = containerRef.current?.offsetWidth ?? 1;
    const velocity = Math.abs(dragX) / Math.max(Date.now() - state.t, 1);
    const commits = Math.abs(dragX) > width * SWIPE_COMMIT_FRACTION || velocity > SWIPE_COMMIT_VELOCITY;
    if (commits && dragX < 0 && index < count - 1) go(panes[index + 1].id);
    else if (commits && dragX > 0 && index > 0) go(panes[index - 1].id);
    setDragX(null);
  }

  const dragging = dragX !== null;
  const nameOf = (pane: Pane) => pane.ariaLabel ?? (typeof pane.label === "string" ? pane.label : pane.id);

  const tabs = useMemo(
    () => (
      <div
        role="tablist"
        aria-label={tabsLabel}
        onKeyDown={onTabKeyDown}
        data-no-swipe
        className={tabListClassName}
      >
        {panes.map((pane) => (
          <button
            key={pane.id}
            ref={(element) => {
              tabRefs.current[pane.id] = element;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${pane.id}`}
            aria-selected={active === pane.id}
            aria-controls={`${idPrefix}-pane-${pane.id}`}
            tabIndex={active === pane.id ? 0 : -1}
            onClick={() => go(pane.id)}
            className={tabClassName(active === pane.id)}
          >
            {pane.label}
          </button>
        ))}
      </div>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panes, active, idPrefix, tabsLabel, tabListClassName, tabClassName, go],
  );

  if (count === 0) return null;

  const previous = index > 0 ? panes[index - 1] : null;
  const next = index < count - 1 ? panes[index + 1] : null;
  const chevronClasses =
    "pointer-events-auto sticky top-[45vh] flex h-10 w-10 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <>
      {renderTabs ? renderTabs({ tabs, active }) : tabs}

      {/* Phones/tablets have no edge chevrons — the dots hint that more panes exist. */}
      {showDots && count > 1 && (
        <div className="-my-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
          {panes.map((pane) => (
            <span
              key={pane.id}
              className={cn("h-1.5 w-1.5 rounded-full", active === pane.id ? "bg-primary" : "bg-muted-foreground/30")}
            />
          ))}
        </div>
      )}

      <div className="relative">
        {/* Desktop edge chevrons: sticky at viewport mid-height; each direction only where available. */}
        {previous && (
          <div className={cn("pointer-events-none absolute inset-y-0 hidden lg:block", chevronOffsets[0])}>
            <button type="button" aria-label={`Show ${nameOf(previous)}`} onClick={() => go(previous.id)} className={chevronClasses}>
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}
        {next && (
          <div className={cn("pointer-events-none absolute inset-y-0 hidden lg:block", chevronOffsets[1])}>
            <button type="button" aria-label={`Show ${nameOf(next)}`} onClick={() => go(next.id)} className={chevronClasses}>
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}

        <div
          ref={containerRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className={cn("touch-pan-y overflow-hidden", switching && "motion-safe:transition-[height] motion-safe:duration-300")}
          style={{ height: heights[active] }}
        >
          <div
            className={cn("flex items-start ease-out motion-safe:duration-300", !dragging && "motion-safe:transition-transform")}
            style={{
              width: `${count * 100}%`,
              transform: `translateX(calc(${(-index * 100) / count}% + ${dragX ?? 0}px))`,
            }}
          >
            {panes.map((pane) => (
              <div
                key={pane.id}
                ref={(element) => {
                  paneRefs.current[pane.id] = element;
                }}
                id={`${idPrefix}-pane-${pane.id}`}
                role="tabpanel"
                aria-labelledby={`${idPrefix}-tab-${pane.id}`}
                className={cn("flex-shrink-0", paneClassName)}
                style={{ width: `${100 / count}%` }}
              >
                {pane.content}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
