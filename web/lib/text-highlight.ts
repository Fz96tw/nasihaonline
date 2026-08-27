// Shared, pure text-highlighting logic used both for the What's New search
// results list (a short snippet around the match) and for highlighting every
// match on a detail page reached from a search result. Deliberately no HTML
// string-building anywhere here — callers render the returned segments as
// React nodes (see components/highlight-text.tsx), so raw user content (a
// forum post body, a library description, etc.) is never interpreted as
// markup, only ever shown as text. That's what keeps this safe against
// stored XSS despite operating on unsanitized member-authored text.

export type HighlightSegment = { text: string; matched: boolean };

// Meilisearch tokenizes a query into words and matches each independently
// (not as one contiguous phrase), so "board meeting" highlights "board" and
// "meeting" wherever either appears — matching what actually got this item
// returned as a search hit, not just an exact-phrase substring a user might
// not even see on the page.
function queryWords(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` into segments alternating matched/unmatched, for rendering
 * each query word highlighted wherever it appears (case-insensitive). Pass
 * an empty/undefined query to get the whole text back as a single
 * unmatched segment (i.e. plain rendering, no highlight).
 */
export function splitHighlightSegments(text: string, query: string | undefined): HighlightSegment[] {
  const words = query ? queryWords(query) : [];
  if (words.length === 0) return [{ text, matched: false }];

  const pattern = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  // String.split with a capturing group interleaves matched substrings into
  // the result — odd indices are always the captured (matched) group here,
  // since `pattern` has exactly one capturing group around the alternation.
  return parts.filter((part) => part.length > 0).map((part, index) => ({
    text: part,
    matched: index % 2 === 1,
  }));
}

const SNIPPET_WINDOW_CHARS = 160;

/**
 * Extracts a window of `text` centered on the first query-word match,
 * snapped outward to word boundaries, with an ellipsis on whichever side(s)
 * were truncated. Falls back to a plain leading truncation (this module's
 * only concession to feed-server.ts's prior `truncate()` behavior) when the
 * query doesn't actually appear in this particular field — a hit can match
 * on a different field (e.g. author name) than the one being excerpted.
 */
export function extractSnippet(text: string, query: string, windowChars = SNIPPET_WINDOW_CHARS): string {
  const trimmed = text.trim();
  const words = queryWords(query);
  if (words.length === 0) return truncateEllipsis(trimmed, windowChars);

  const pattern = new RegExp(words.map(escapeRegExp).join("|"), "i");
  const match = pattern.exec(trimmed);
  if (!match) return truncateEllipsis(trimmed, windowChars);

  const matchStart = match.index;
  const matchEnd = matchStart + match[0].length;
  const halfWindow = Math.floor((windowChars - match[0].length) / 2);

  let start = Math.max(0, matchStart - halfWindow);
  let end = Math.min(trimmed.length, matchEnd + halfWindow);

  // Snap outward to word boundaries so we don't cut a word in half.
  while (start > 0 && !/\s/.test(trimmed[start - 1])) start -= 1;
  while (end < trimmed.length && !/\s/.test(trimmed[end])) end += 1;

  const prefix = start > 0 ? "…" : "";
  const suffix = end < trimmed.length ? "…" : "";
  return `${prefix}${trimmed.slice(start, end).trim()}${suffix}`;
}

function truncateEllipsis(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
