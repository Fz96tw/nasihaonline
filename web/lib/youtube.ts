/**
 * Extracts a YouTube video id from any of the URL shapes a member might
 * paste into "Submit Resource" (watch?v=, youtu.be/, already an /embed/
 * link).
 */
export function extractYoutubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1) || null;
    }
    if (url.pathname.startsWith("/embed/")) {
      return url.pathname.replace("/embed/", "") || null;
    }
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(rawUrl: string): string | null {
  const id = extractYoutubeVideoId(rawUrl);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

/**
 * hqdefault.jpg exists for every uploaded video (unlike maxresdefault,
 * which is only generated for HD sources), so it's the safe default for
 * a hero/thumbnail image rather than a real extracted video frame.
 */
export function youtubeThumbnailUrl(rawUrl: string): string | null {
  const id = extractYoutubeVideoId(rawUrl);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
