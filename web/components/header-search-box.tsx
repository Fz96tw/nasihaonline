"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearchExpanded } from "@/components/header-search-context";
import { cn } from "@/lib/utils";

/**
 * Desktop-only header search (see header-search-context.tsx for why the
 * expand state is shared via Context). The icon's position never moves —
 * clicking it toggles an input that grows to its LEFT, reclaiming the width
 * DesktopNavLinks just vacated, rather than pushing What's New/Dashboard/
 * notifications/avatar further right. Submitting navigates to the same
 * `/whats-new?q=` results page FeedSearchForm already uses, so both search
 * entry points land on identical behavior (including the browser back
 * button returning to a real results page, not just closing an overlay).
 */
export function HeaderSearchBox() {
  const { expanded, toggle } = useSearchExpanded();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const urlQuery = pathname === "/whats-new" ? searchParams.get("q") ?? "" : "";
  const [value, setValue] = useState(urlQuery);

  // Reflects the current page's active query whenever it changes underneath
  // us (e.g. clicking a type-filter pill on /whats-new, or navigating there
  // fresh) — not just on first mount.
  useEffect(() => {
    setValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  function submit() {
    const trimmed = value.trim();
    router.push(trimmed ? `/whats-new?q=${encodeURIComponent(trimmed)}` : "/whats-new");
  }

  return (
    <div className="hidden items-center lg:flex">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={cn(
          "overflow-hidden transition-[width] duration-200 ease-out",
          expanded ? "w-64" : "w-0",
        )}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            value={value}
            placeholder="Search NASIHA…"
            aria-label="Search NASIHA"
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.blur();
                toggle();
              }
            }}
            className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
          />
          {value ? (
            <button
              type="button"
              onClick={() => setValue("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </form>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label={expanded ? "Close search" : "Search"}
        title="Search"
        onClick={toggle}
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}
