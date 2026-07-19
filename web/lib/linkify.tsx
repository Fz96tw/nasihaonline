import Link from "next/link";
import { Fragment, type ReactNode } from "react";

const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s<>"]+/g;

// Trailing punctuation that's almost always sentence punctuation, not part
// of the URL itself (e.g. "check https://example.com." at a sentence end).
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

/**
 * Turns absolute http(s) URLs in an Announcement body into links —
 * same-origin (internal, e.g. a forum thread or event page) links navigate
 * client-side in the same tab via next/link; everything else opens in a new
 * tab. Bare relative paths are left as plain text: matching only absolute
 * URLs avoids false positives on ordinary text like "see page 3/4".
 */
export function linkifyAnnouncementBody(text: string): ReactNode {
  const appOrigin = getAppOrigin();
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  ABSOLUTE_URL_PATTERN.lastIndex = 0;
  while ((match = ABSOLUTE_URL_PATTERN.exec(text)) !== null) {
    const rawUrl = match[0];
    const trailingMatch = rawUrl.match(TRAILING_PUNCTUATION);
    const trailing = trailingMatch ? trailingMatch[0] : "";
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    const start = match.index;

    if (!url) {
      lastIndex = start + rawUrl.length;
      continue;
    }

    if (start > lastIndex) {
      parts.push(<Fragment key={key++}>{text.slice(lastIndex, start)}</Fragment>);
    }

    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }

    if (parsed && appOrigin && parsed.origin === appOrigin) {
      parts.push(
        <Link key={key++} href={`${parsed.pathname}${parsed.search}${parsed.hash}`}>
          {url}
        </Link>,
      );
    } else {
      parts.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>,
      );
    }

    if (trailing) parts.push(<Fragment key={key++}>{trailing}</Fragment>);
    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }

  return parts;
}
