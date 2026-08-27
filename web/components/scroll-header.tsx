"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchQuery } from "@/components/header-search-context";
import { cn } from "@/lib/utils";

// Two thresholds (instead of one) create a dead zone so scroll jitter near the
// boundary (e.g. trackpad momentum/rubber-banding) can't flip the header back
// and forth mid-transition.
const COMPACT_THRESHOLD = 40;
const EXPAND_THRESHOLD = 10;
const HEADER_HEIGHT_EXPANDED = "92px";
const HEADER_HEIGHT_COMPACT = "62px";

export function ScrollHeader({
  children,
  hasSearchRow = false,
}: {
  children: ReactNode;
  /** True when a HeaderSearchRow immediately follows this header — that row owns the bottom border/shadow instead (see below), so this one must not also draw its own. */
  hasSearchRow?: boolean;
}) {
  // Frozen at full height while a search is pinned (see header-search-
  // context.tsx) — "the nav bar does not change size" while actively
  // searching applies to this row too, not just the search row below it.
  const { pinned, searchRowVisible } = useSearchQuery();

  useEffect(() => {
    const root = document.documentElement;
    if (pinned) {
      root.style.setProperty("--header-height", HEADER_HEIGHT_EXPANDED);
      return;
    }

    let isCompact = window.scrollY > COMPACT_THRESHOLD;

    const applyState = (compact: boolean) => {
      isCompact = compact;
      root.style.setProperty(
        "--header-height",
        compact ? HEADER_HEIGHT_COMPACT : HEADER_HEIGHT_EXPANDED,
      );
    };

    const handleScroll = () => {
      const y = window.scrollY;
      if (!isCompact && y > COMPACT_THRESHOLD) {
        applyState(true);
      } else if (isCompact && y < EXPAND_THRESHOLD) {
        applyState(false);
      }
    };

    applyState(isCompact);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pinned]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-[var(--header-height)] gap-3 bg-background px-4 transition-[height] duration-300 ease-in-out lg:gap-6 lg:px-8",
        // items-center normally — but while the search row below is actually
        // showing, that centering is exactly what was reading as "too much
        // space between the menu labels and the search box": items-center
        // splits this row's own extra height (92/62px box, much shorter
        // content) evenly above AND below the content, so removing only the
        // bottom half of that isn't possible via padding alone. Flushing
        // content to the bottom instead collapses that bottom half to ~0,
        // leaving only the (shorter, already-tight) search row's own
        // padding between the two — items-center is restored the instant
        // the search row goes away, since content should stay vertically
        // centered in the ordinary one-row header.
        hasSearchRow && searchRowVisible ? "items-end pb-2" : "items-center",
        // When a HeaderSearchRow follows, IT owns the bottom border/shadow
        // instead, at whatever its *current* height is (0 or expanded).
        // Without this, two independent bottom borders stack whenever the
        // search row is revealed: this row's own (fixed at its own height)
        // plus the search row's, showing up as a stray divider line between
        // the icon row and the search row instead of one seamless expanded
        // header.
        !hasSearchRow && "border-b shadow-sm",
      )}
    >
      {children}
    </header>
  );
}
