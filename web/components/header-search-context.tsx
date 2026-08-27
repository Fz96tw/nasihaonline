"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type SearchExpandedContextValue = {
  expanded: boolean;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
};

const SearchExpandedContext = createContext<SearchExpandedContextValue | null>(null);

/**
 * Shared expand/collapse state for the desktop header search — read by both
 * HeaderSearchBox (the icon/input itself) and DesktopNavLinks (the "Our
 * Mission"/"Community"/"Support Us" group, which hides while search is
 * expanded to give the growing input room). They live in different parts of
 * site-header.tsx's DOM tree, hence Context rather than local state.
 */
export function SearchExpandedProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);
  const toggle = useCallback(() => setExpanded((value) => !value), []);

  // ⌘K / Ctrl+K opens search from anywhere, matching the common command-
  // palette-style shortcut convention even though this isn't a palette.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setExpanded(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <SearchExpandedContext.Provider value={{ expanded, expand, collapse, toggle }}>
      {children}
    </SearchExpandedContext.Provider>
  );
}

export function useSearchExpanded() {
  const context = useContext(SearchExpandedContext);
  if (!context) throw new Error("useSearchExpanded must be used within a SearchExpandedProvider");
  return context;
}
