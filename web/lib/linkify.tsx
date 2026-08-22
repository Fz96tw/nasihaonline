import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// Matches, in priority order: a `![alt](url)` pasted-image token (see
// PastedImage/lib/use-paste-image-upload.ts — checked first since it would
// otherwise partially match the next alternative with a stray leading
// `!`), a markdown-style [label](url) link, or a bare absolute http(s)
// URL — all in the same left-to-right pass so any mix can appear in the
// same text. The image alternative's url isn't restricted to https? since
// our own upload endpoints return relative same-origin paths.
const LINK_PATTERN =
  /!\[([^\]]*)\]\(([^\s()]+)\)|\[([^\]]+)\]\((https?:\/\/[^\s()]+)\)|https?:\/\/[^\s<>"]+/g;

// Trailing punctuation that's almost always sentence punctuation, not part
// of the URL itself (e.g. "check https://example.com." at a sentence end).
// Only applies to bare URLs — markdown links have an explicit close paren.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

// The only URL shapes a `![alt](url)` token is ever allowed to render as an
// actual <img> for — same-origin by construction (relative paths returned
// by uploadForumPostImage/uploadInboxMessageImage/uploadLibraryBodyImage's
// get*Url helpers in lib/storage.ts), never an arbitrary externally-hosted
// image. A hand-typed `![alt](https://evil.example/pixel.png)` falls
// through to ordinary link rendering instead.
const IMAGE_PROXY_PREFIXES = ["/api/forums/post-image/", "/api/inbox/message-image/", "/api/library/body-image/"];

/**
 * Count of `![alt](url)` tokens in `text` pointing at one of our own
 * image-upload proxies — used client-side (lib/use-paste-image-upload.ts)
 * to locally cap how many images a composer will let you paste. The real
 * enforcement point is server-side (lib/pasted-images-server.ts's
 * MAX_PASTED_IMAGES_PER_BODY); this is a UX nicety, not a security gate.
 */
export function countPastedImageTokens(text: string): number {
  const pattern = /!\[[^\]]*\]\(([^\s()]+)\)/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (IMAGE_PROXY_PREFIXES.some((prefix) => match![1].startsWith(prefix))) count++;
  }
  return count;
}

function renderImage(key: number, alt: string, url: string): ReactNode | null {
  if (!IMAGE_PROXY_PREFIXES.some((prefix) => url.startsWith(prefix))) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy path, not a remote host next/image can allowlist (see components/ui/avatar.tsx).
    <img
      key={key}
      src={url}
      alt={alt}
      loading="lazy"
      className="my-1 block max-h-80 max-w-full rounded-md border object-contain"
    />
  );
}

function getAppOrigin(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;
  try {
    return new URL(appUrl).origin;
  } catch {
    return null;
  }
}

function renderLink(key: number, label: string, url: string, appOrigin: string | null): ReactNode {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  const linkClassName = "font-medium text-primary underline-offset-4 hover:underline";

  if (parsed && appOrigin && parsed.origin === appOrigin) {
    return (
      <Link key={key} href={`${parsed.pathname}${parsed.search}${parsed.hash}`} className={linkClassName}>
        {label}
      </Link>
    );
  }

  return (
    <a key={key} href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
      {label}
    </a>
  );
}

/**
 * Turns links in plain text (Announcement bodies, ForumPost bodies, ...)
 * into clickable links — same-origin (internal, e.g. a forum thread or
 * event page) links navigate client-side in the same tab via next/link;
 * everything else opens in a new tab. Supports two forms: markdown-style
 * `[label](url)` for a friendly display label, and bare absolute http(s)
 * URLs which are autolinked using the URL itself as the label. Bare
 * relative paths are left as plain text: matching only absolute URLs
 * avoids false positives on ordinary text like "see page 3/4".
 */
export function linkifyText(text: string): ReactNode {
  const appOrigin = getAppOrigin();
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  LINK_PATTERN.lastIndex = 0;
  while ((match = LINK_PATTERN.exec(text)) !== null) {
    const start = match.index;
    const [rawMatch, imageAlt, imageUrl, label, markdownUrl] = match;

    if (imageUrl !== undefined) {
      if (start > lastIndex) {
        parts.push(<Fragment key={key++}>{text.slice(lastIndex, start)}</Fragment>);
      }
      const image = renderImage(key, imageAlt, imageUrl);
      // A hand-typed image token whose url isn't one of our own proxy
      // paths falls back to an ordinary link, same as any other markdown
      // link — rather than rendering as plain (unclickable) text.
      parts.push(image ?? renderLink(key, imageAlt || imageUrl, imageUrl, appOrigin));
      key++;
      lastIndex = start + rawMatch.length;
      continue;
    }

    if (label && markdownUrl) {
      if (start > lastIndex) {
        parts.push(<Fragment key={key++}>{text.slice(lastIndex, start)}</Fragment>);
      }
      parts.push(renderLink(key++, label, markdownUrl, appOrigin));
      lastIndex = start + rawMatch.length;
      continue;
    }

    const rawUrl = rawMatch;
    const trailingMatch = rawUrl.match(TRAILING_PUNCTUATION);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;

    if (!url) {
      lastIndex = start + rawUrl.length;
      continue;
    }

    if (start > lastIndex) {
      parts.push(<Fragment key={key++}>{text.slice(lastIndex, start)}</Fragment>);
    }

    parts.push(renderLink(key++, url, url, appOrigin));
    if (trailing) parts.push(<Fragment key={key++}>{trailing}</Fragment>);
    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return parts;
}
