"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FollowingFeed } from "@/components/feed/following-feed";
import { cn } from "@/lib/utils";

const PANES = ["all", "following"] as const;
type PaneId = (typeof PANES)[number];
const LABELS: Record<PaneId, string> = { all: "All", following: "Following" };

// Horizontal drag past this fraction of the width (or a quick flick) commits the swipe.
const SWIPE_COMMIT_FRACTION = 0.25;
const SWIPE_COMMIT_VELOCITY = 0.4; // px per ms
// Don't treat a touch as a swipe until it has moved this far, mostly sideways.
const SWIPE_INTENT_PX = 10;

/**
 * What's New as two sliding panes — the full feed ("All") and "Following"
 * (only members the viewer follows). The tabs are the real, always-visible
 * control; edge chevrons (desktop) and touch swipe (phones) are shortcuts.
 * Only rendered for members who follow at least one person, outside search.
 */
export function WhatsNewPanes({
  header,
  allPaneControls,
  allPane,
  currentUserId,
}: {
  /** The title — the tabs sit to its right. */
  header: ReactNode;
  /** Controls under the title that only apply to the All pane (the "Show only my communities" checkbox) — hidden on Following. */
  allPaneControls?: ReactNode;
  /** The ordinary feed: type pills + list. Server-rendered by the page. */
  allPane: ReactNode;
  currentUserId: string;
}) {
  const [active, setActive] = useState<PaneId>("all");
  const index = PANES.indexOf(active);
  const [dragX, setDragX] = useState<number | null>(null);
  // Height only animates while switching panes — never when a pane's own
  // content grows (e.g. the Following feed finishing its first load).
  const [switching, setSwitching] = useState(false);
  const [heights, setHeights] = useState<Record<PaneId, number | undefined>>({ all: undefined, following: undefined });
  const paneRefs = useRef<Record<PaneId, HTMLDivElement | null>>({ all: null, following: null });
  const containerRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; dragging: boolean } | null>(null);

  // The container is as tall as the active pane (not the taller of the two),
  // so there's no blank gap below a short Following pane.
  useEffect(() => {
    const observers = PANES.map((id) => {
      const element = paneRefs.current[id];
      if (!element) return null;
      const observer = new ResizeObserver(() => setHeights((prev) => ({ ...prev, [id]: element.offsetHeight })));
      observer.observe(element);
      return observer;
    });
    return () => observers.forEach((observer) => observer?.disconnect());
  }, []);

  // The off-screen pane is unreachable by keyboard/screen reader.
  useEffect(() => {
    PANES.forEach((id) => {
      const element = paneRefs.current[id];
      if (!element) return;
      element.toggleAttribute("inert", id !== active);
      element.setAttribute("aria-hidden", String(id !== active));
    });
  }, [active]);

  const switchTimer = useRef<ReturnType<typeof setTimeout>>();
  const go = useCallback((id: PaneId) => {
    setActive((current) => {
      if (current !== id) {
        setSwitching(true);
        clearTimeout(switchTimer.current);
        switchTimer.current = setTimeout(() => setSwitching(false), 350);
      }
      return id;
    });
  }, []);
  useEffect(() => () => clearTimeout(switchTimer.current), []);

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") go("following");
    else if (event.key === "ArrowLeft") go("all");
    else return;
    event.preventDefault();
  }

  function onTouchStart(event: TouchEvent) {
    // Leave the type-pill row (and anything else marked) to scroll on its own.
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
    const atEnd = index === PANES.length - 1 && dx < 0;
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
    if (commits && dragX < 0 && index < PANES.length - 1) go(PANES[index + 1]);
    else if (commits && dragX > 0 && index > 0) go(PANES[index - 1]);
    setDragX(null);
  }

  const dragging = dragX !== null;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          {header}
          {active === "all" && allPaneControls}
        </div>
        <div
          role="tablist"
          aria-label="What's New view"
          onKeyDown={onTabKeyDown}
          className="flex flex-shrink-0 rounded-full border bg-muted p-0.5"
        >
          {PANES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`whats-new-tab-${id}`}
              aria-selected={active === id}
              aria-controls={`whats-new-pane-${id}`}
              tabIndex={active === id ? 0 : -1}
              onClick={() => go(id)}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {LABELS[id]}
            </button>
          ))}
        </div>
      </div>

      {/* Phones/tablets have no edge chevrons — the dots hint that a second pane exists. */}
      <div className="-my-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
        {PANES.map((id) => (
          <span key={id} className={cn("h-1.5 w-1.5 rounded-full", active === id ? "bg-primary" : "bg-muted-foreground/30")} />
        ))}
      </div>

      <div className="relative">
        {/* Desktop edge chevrons: outside the card, sticky at viewport mid-height; only the available direction. */}
        {active === "all" && (
          <div className="pointer-events-none absolute -right-12 inset-y-0 hidden lg:block">
            <button
              type="button"
              aria-label="Show Following"
              onClick={() => go("following")}
              className="pointer-events-auto sticky top-[45vh] flex h-10 w-10 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}
        {active === "following" && (
          <div className="pointer-events-none absolute -left-12 inset-y-0 hidden lg:block">
            <button
              type="button"
              aria-label="Show All"
              onClick={() => go("all")}
              className="pointer-events-auto sticky top-[45vh] flex h-10 w-10 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
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
            className={cn(
              "flex w-[200%] items-start ease-out motion-safe:duration-300",
              !dragging && "motion-safe:transition-transform",
            )}
            style={{ transform: `translateX(calc(${-index * 50}% + ${dragX ?? 0}px))` }}
          >
            <div
              ref={(element) => {
                paneRefs.current.all = element;
              }}
              id="whats-new-pane-all"
              role="tabpanel"
              aria-labelledby="whats-new-tab-all"
              className="flex w-1/2 flex-shrink-0 flex-col gap-6"
            >
              {allPane}
            </div>
            <div
              ref={(element) => {
                paneRefs.current.following = element;
              }}
              id="whats-new-pane-following"
              role="tabpanel"
              aria-labelledby="whats-new-tab-following"
              className="flex w-1/2 flex-shrink-0 flex-col gap-6"
            >
              <FollowingFeed active={active === "following"} currentUserId={currentUserId} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
