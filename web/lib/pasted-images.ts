/**
 * Shared constants + pure helpers for the `![alt](url)` pasted-image tokens
 * that Forum post and Inbox message bodies carry (see
 * lib/use-paste-image-upload.ts for how they're inserted, lib/linkify.tsx
 * for how they're rendered inline). Deliberately free of `server-only` and
 * of any React import so both server code (lib/feed-server.ts) and client
 * code (lib/linkify.tsx via countPastedImageTokens) can share the prefix
 * list without dragging one bundle into the other.
 *
 * Must stay in sync with lib/pasted-images-server.ts's OWNER_URL_PREFIX and
 * lib/storage.ts's get*ImageUrl helpers.
 */

export const FORUM_POST_IMAGE_URL_PREFIX = "/api/forums/post-image/";

// The only `![](url)` targets ever treated as a real embedded image rather
// than an ordinary link — same-origin proxy paths returned by our own
// upload endpoints, never an arbitrary externally-hosted image URL.
export const PASTED_IMAGE_PROXY_PREFIXES = [
  FORUM_POST_IMAGE_URL_PREFIX,
  "/api/inbox/message-image/",
  "/api/library/body-image/",
];

const MARKDOWN_IMAGE_TOKEN = /!\[[^\]]*\]\(([^\s()]+)\)/g;

/**
 * The first `![](url)` token in `body` whose url points at our Forum
 * post-image proxy, or null. Used by the What's New feed to surface a
 * forum thread's pasted screenshot inline in its feed row — the
 * /api/forums/post-image route re-checks thread visibility per request, so
 * this is never more visible than the thread itself.
 */
export function firstForumPostImageUrl(body: string | null | undefined): string | undefined {
  if (!body) return undefined;
  MARKDOWN_IMAGE_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_IMAGE_TOKEN.exec(body)) !== null) {
    if (match[1].startsWith(FORUM_POST_IMAGE_URL_PREFIX)) return match[1];
  }
  return undefined;
}

/**
 * Strips every `![alt](url)` token pointing at one of our image proxies
 * from `body`, collapsing the whitespace left behind — so a feed excerpt
 * shows the surrounding prose instead of a raw markdown token (or, for an
 * image-only post, comes back empty and the feed row shows just the image).
 * A hand-typed `![](https://example.com/x.png)` is left untouched, same as
 * linkify's render-as-plain-link fallback.
 */
export function stripPastedImageTokens(body: string): string {
  return body
    .replace(MARKDOWN_IMAGE_TOKEN, (full, url: string) =>
      PASTED_IMAGE_PROXY_PREFIXES.some((prefix) => url.startsWith(prefix)) ? "" : full,
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
