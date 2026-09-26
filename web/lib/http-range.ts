/**
 * Parses a single-range `Range: bytes=…` header against a known object size.
 * Returns the inclusive byte range to serve, `"unsatisfiable"` when the range
 * lies outside the object (answer 416), or `null` when there is no usable
 * Range header (serve the whole object). Multi-range requests are treated as
 * absent, which HTTP allows; players only ever send a single range.
 */
export function parseByteRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // Suffix range: the last N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
