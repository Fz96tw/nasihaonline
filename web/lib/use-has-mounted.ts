"use client";

import { useEffect, useState } from "react";

/**
 * Gates client-only computed values (e.g. Date formatting via the
 * runtime's local timezone) so they render nothing during SSR/the
 * initial hydration pass instead of a value that can differ from the
 * server's — the server and browser can be in different timezones,
 * and any text rendered during hydration must match exactly.
 */
export function useHasMounted(): boolean {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);
  return hasMounted;
}
