"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { SearchResult, SearchResultType } from "@/lib/search-server";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

// Fixed render order, not the order results arrive in from the API —
// matches the domain order used throughout the rest of the app's nav.
const GROUP_ORDER: { type: SearchResultType; label: string }[] = [
  { type: "library", label: "Knowledge Library" },
  { type: "forum", label: "Forums" },
  { type: "profile", label: "Members" },
  { type: "event", label: "Events" },
  { type: "announcement", label: "Announcements" },
  { type: "survey", label: "Surveys" },
  { type: "reviewItem", label: "Peer Review & Feedback" },
];

async function fetchSearchResults(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) throw new Error("Search failed");
  const data = (await response.json()) as { results: SearchResult[] };
  return data.results;
}

/**
 * Global command-palette search (header trigger, next to NotificationBell —
 * only rendered for signed-in members, see site-header.tsx). Self-contained
 * fetch+useState, not react-query: SiteHeader renders outside the
 * `(member)`-only QueryProvider, same rationale as NotificationBell.
 * /api/search is the real authorization boundary (requireUser() + per-domain
 * viewer checks in lib/search-server.ts) — this component just renders
 * whatever it's handed back.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    fetchSearchResults(trimmed, controller.signal)
      .then((data) => {
        setResults(data);
        setLoading(false);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults([]);
    }
  }, []);

  function handleSelect(result: SearchResult) {
    handleOpenChange(false);
    router.push(result.href);
  }

  const trimmedQuery = query.trim();
  const showEmpty = trimmedQuery.length >= MIN_QUERY_LENGTH && !loading && results.length === 0;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 lg:h-10 lg:w-10"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
      </Button>
      <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
        <CommandInput placeholder="Search NASIHA..." value={query} onValueChange={setQuery} />
        <CommandList>
          {trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Keep typing to search...</div>
          ) : loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>
          ) : showEmpty ? (
            <CommandEmpty>No results found.</CommandEmpty>
          ) : (
            GROUP_ORDER.map(({ type, label }) => {
              const items = results.filter((result) => result.type === type);
              if (items.length === 0) return null;
              return (
                <CommandGroup key={type} heading={label}>
                  {items.map((result) => (
                    <CommandItem key={result.id} onSelect={() => handleSelect(result)}>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.subtitle ? (
                          <span className="truncate text-xs text-muted-foreground">{result.subtitle}</span>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
