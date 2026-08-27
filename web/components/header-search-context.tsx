"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type SearchQueryContextValue = {
  query: string;
  setQuery: (value: string) => void;
  /** True once the user has typed something — freezes both header rows at full size regardless of scroll (see scroll-header.tsx / header-search-row.tsx), and is restored to normal scroll-driven behavior the moment the field is cleared. */
  pinned: boolean;
  /** True whenever the search row is actually showing (pinned, or currently scroll-revealed) — set by HeaderSearchRow's own scroll effect only at the moment it flips, not on every scroll event. ScrollHeader reads this to flush its own content to the bottom of its box instead of centering it, which otherwise reads as extra empty space between the icon row and the search row below it. */
  searchRowVisible: boolean;
  setSearchRowVisible: (value: boolean) => void;
};

const SearchQueryContext = createContext<SearchQueryContextValue | null>(null);

const DEFAULT_VALUE: SearchQueryContextValue = {
  query: "",
  setQuery: () => {},
  pinned: false,
  searchRowVisible: false,
  setSearchRowVisible: () => {},
};

export function SearchQueryProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [searchRowVisible, setSearchRowVisibleState] = useState(true);
  const setSearchRowVisible = useCallback((value: boolean) => setSearchRowVisibleState(value), []);
  const value = useMemo(
    () => ({ query, setQuery, pinned: query.trim().length > 0, searchRowVisible, setSearchRowVisible }),
    [query, searchRowVisible, setSearchRowVisible],
  );
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
