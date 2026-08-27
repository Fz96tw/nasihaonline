"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchQuery } from "@/components/header-search-context";

// Two thresholds (instead of one) create a dead zone so scroll jitter near the
// boundary (e.g. trackpad momentum/rubber-banding) can't flip the header back
// and forth mid-transition.
const COMPACT_THRESHOLD = 40;
const EXPAND_THRESHOLD = 10;
const HEADER_HEIGHT_EXPANDED = "92px";
const HEADER_HEIGHT_COMPACT = "62px";

export function ScrollHeader({ children }: { children: ReactNode }) {
  // Frozen at full height while a search is pinned (see header-search-
  // context.tsx) — "the nav bar does not change size" while actively
  // searching applies to this row too, not just the search row below it.
  const { pinned } = useSearchQuery();

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
    <header className="sticky top-0 z-50 flex h-[var(--header-height)] items-center gap-3 border-b bg-background px-4 shadow-sm transition-[height] duration-300 ease-in-out lg:gap-6 lg:px-8">
      {children}
    </header>
  );
}
