// Pure helpers for the Weekly Reflection background images — no db, no fs, no
// "@/" alias, so the rotation logic is unit-testable under node:test. Listing
// the folder lives in lib/reflection-images-server.ts.

/** Where the images are served from (public/images/weeklyreflection/). */
export const REFLECTION_IMAGE_URL_BASE = "/images/weeklyreflection";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/** A usable background: an image extension and not a hidden/dot file (README.md, .gitkeep, .DS_Store are ignored). */
export function isReflectionImageFile(name: string): boolean {
  if (name.startsWith(".")) return false;
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Least-recently-used image: one never used comes first, then the one used
 * longest ago, ties broken by file name so the choice is deterministic.
 * `lastUsed` maps a file name to when a post last used it; names that no longer
 * exist in `files` are irrelevant. Null when there are no images.
 */
export function pickNextImage(files: readonly string[], lastUsed: ReadonlyMap<string, Date>): string | null {
  const candidates = files.filter(isReflectionImageFile);
  let best: string | null = null;
  for (const file of candidates) {
    if (best === null || compareByRotation(file, best, lastUsed) < 0) best = file;
  }
  return best;
}

function compareByRotation(a: string, b: string, lastUsed: ReadonlyMap<string, Date>): number {
  const aUsed = lastUsed.get(a);
  const bUsed = lastUsed.get(b);
  if (!aUsed && bUsed) return -1;
  if (aUsed && !bUsed) return 1;
  if (aUsed && bUsed) {
    const byTime = aUsed.getTime() - bUsed.getTime();
    if (byTime !== 0) return byTime;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Servable URL for a stored file name (encoded, since admins may use spaces or other characters). */
export function reflectionImageUrl(file: string): string {
  return `${REFLECTION_IMAGE_URL_BASE}/${encodeURIComponent(file)}`;
}
