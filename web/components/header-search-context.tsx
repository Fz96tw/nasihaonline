"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type SearchQueryContextValue = {
  query: string;
  setQuery: (value: string) => void;
  /** True once the user has typed something — freezes both header rows at full size regardless of scroll (see scroll-header.tsx / header-search-row.tsx), and is restored to normal scroll-driven behavior the moment the field is cleared. */
  pinned: boolean;
};

const SearchQueryContext = createContext<SearchQueryContextValue | null>(null);

const DEFAULT_VALUE: SearchQueryContextValue = { query: "", setQuery: () => {}, pinned: false };

export function SearchQueryProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery, pinned: query.trim().length > 0 }), [query]);
  return <SearchQueryContext.Provider value={value}>{children}</SearchQueryContext.Provider>;
}

/**
 * Non-throwing on purpose (unlike a typical required-context hook): both
 * ScrollHeader and SiteHeaderSkeleton render without a SearchQueryProvider
 * above them (skeleton has no search UI at all, and ScrollHeader is the
 * shared primitive both use), so this needs a safe default rather than an
 * error when no provider is mounted.
 */
export function useSearchQuery(): SearchQueryContextValue {
  return useContext(SearchQueryContext) ?? DEFAULT_VALUE;
}
