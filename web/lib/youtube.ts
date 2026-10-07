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

/**
 * First YouTube watch/short/embed URL in a block of plain text (a forum
 * post body), or null — same host check as lib/linkify.tsx's own embed
 * decision, so the feed only previews a video the thread itself would embed.
 */
export function firstYoutubeUrlInText(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const match of Array.from(text.matchAll(/https?:\/\/[^\s<>"]+/g))) {
    const url = match[0].replace(/[.,;:!?)\]}]+$/, "");
    try {
      const { hostname } = new URL(url);
      const isYoutubeHost = hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com");
      if (isYoutubeHost && extractYoutubeVideoId(url)) return url;
    } catch {
      continue;
    }
  }
  return null;
}
