"use client";

import { type ReactNode } from "react";
import { useSearchQuery } from "@/components/header-search-context";
import { cn } from "@/lib/utils";

export function ScrollHeader({
  children,
  hasSearchRow = false,
}: {
  children: ReactNode;
  /** True when a HeaderSearchRow immediately follows this header — that row owns the bottom border/shadow instead (see below), so this one must not also draw its own. */
  hasSearchRow?: boolean;
}) {
  // Height used to grow at the top of the page and shrink once scrolled —
  // deliberately removed (always the compact height now, set as
  // globals.css's --header-height default; nothing here still varies it) —
  // it read as the header getting unexpectedly taller right when landing
  // back at the top, not as a helpful "more room" cue.
  const { searchRowVisible } = useSearchQuery();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-[var(--header-height)] gap-3 bg-background px-4 transition-[height] duration-300 ease-in-out lg:gap-6 lg:px-8",
        // items-center normally — but while the search row below is actually
        // showing, that centering is exactly what was reading as "too much
        // space between the menu labels and the search box": items-center
        // splits this row's own height (still taller than its actual
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
