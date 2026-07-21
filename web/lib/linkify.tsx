import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// Matches either a markdown-style [label](url) link, or a bare absolute
// http(s) URL — checked in the same left-to-right pass so both forms can
// appear in the same text.
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s()]+)\)|https?:\/\/[^\s<>"]+/g;

// Trailing punctuation that's almost always sentence punctuation, not part
// of the URL itself (e.g. "check https://example.com." at a sentence end).
// Only applies to bare URLs — markdown links have an explicit close paren.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

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
    const [rawMatch, label, markdownUrl] = match;

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
