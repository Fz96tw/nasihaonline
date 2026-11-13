// Pure parsing helpers for curated "From the Web" articles — no network, no
// database, no "@/" imports, so `node --test --experimental-strip-types` can
// exercise them directly (lib/curated-article-parse.test.ts). The fetch job
// (lib/curated-article-fetch.ts) wires these to the network and Prisma.

import { XMLParser } from "fast-xml-parser";

/** Longest excerpt we keep — a teaser, never the article body. */
export const ARTICLE_EXCERPT_MAX = 280;
export const ARTICLE_TITLE_MAX = 300;

/** One entry from an RSS/Atom feed, after normalization. */
export type ParsedFeedEntry = {
  title: string;
  /** Absolute http(s) URL as the feed gave it (not yet normalized/unwrapped). */
  link: string;
  /** Plain-text summary (HTML stripped), may be empty. */
  summary: string;
  publishedAt: Date | null;
  /** Best image the feed itself carries for this entry, if any. */
  imageUrl: string | null;
};

export type ParsedFeed = { title: string | null; entries: ParsedFeedEntry[] };

// Query parameters that only ever identify a campaign/click, never the page.
const TRACKING_PARAM_PATTERNS = [/^utm_/i, /^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|ref_src|cmpid|ocid)$/i];

/**
 * Canonical form used as the dedupe key and the stored link: host
 * lowercased, fragment dropped, tracking parameters removed, remaining
 * parameters sorted, trailing slash trimmed from non-root paths, default
 * port dropped. "www." is kept — it's the URL we link members to, and not
 * every site redirects between the two. Returns null for anything that
 * isn't an absolute http(s) URL.
 */
export function normalizeArticleUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  const kept = Array.from(url.searchParams.entries()).filter(
    ([key]) => !TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key)),
  );
  kept.sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "");
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  return url.toString();
}

/**
 * News-search aggregator links point at a click-tracking redirect, with the
 * real article in a query parameter (Bing News: apiclick.aspx?url=…).
 * Returns the wrapped URL, or the link unchanged when it isn't one.
 */
export function unwrapAggregatorLink(link: string): string {
  try {
    const url = new URL(link);
    if (/(^|\.)bing\.com$/i.test(url.hostname) && /\/apiclick\.aspx$/i.test(url.pathname)) {
      const target = url.searchParams.get("url");
      if (target && /^https?:\/\//i.test(target)) return target;
    }
  } catch {
    // fall through
  }
  return link;
}

/** The Bing News RSS feed for a free-text search query. */
export function buildNewsSearchFeedUrl(query: string): string {
  const params = new URLSearchParams({ q: query.trim(), format: "rss", mkt: "en-US" });
  return `https://www.bing.com/news/search?${params.toString()}`;
}

/** Lowercased, trimmed, de-duplicated, empties dropped — how keyword lists are stored. */
export function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(new Set(keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean)));
}

function containsKeyword(haystack: string, keyword: string): boolean {
  // Whole-word-ish match: a keyword must not be glued to letters/digits on
  // either side, so "art" doesn't match "start" but "3d printing" still
  // matches "3D printing's".
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(haystack);
}

/**
 * A source's keyword rules against an entry's title + summary. Any exclude
 * match rejects; otherwise an empty include list keeps everything, and a
 * non-empty one needs at least one match.
 */
export function matchesKeywordRules(
  text: string,
  rules: { includeKeywords: string[]; excludeKeywords: string[] },
): boolean {
  const haystack = text.toLowerCase();
  if (rules.excludeKeywords.some((keyword) => containsKeyword(haystack, keyword))) return false;
  if (rules.includeKeywords.length === 0) return true;
  return rules.includeKeywords.some((keyword) => containsKeyword(haystack, keyword));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** HTML → single-spaced plain text (tags dropped, entities decoded). */
export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncates at a word boundary with an ellipsis. */
export function truncateText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function firstImgSrc(html: string): string | null {
  const match = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(html);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Text content of a parsed XML node, whether it came through as a string or {#text}. */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

function attr(node: unknown, name: string): string | null {
  if (node && typeof node === "object") {
    const value = (node as Record<string, unknown>)[`@_${name}`];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function absolutize(url: string | null, base: string | null): string | null {
  if (!url) return null;
  try {
    const resolved = new URL(url, base ?? undefined);
    return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/** media:content / media:thumbnail / image enclosure / News:Image, in that order. */
function feedItemImage(item: Record<string, unknown>, html: string, base: string | null): string | null {
  const mediaGroup = item["media:group"] as Record<string, unknown> | undefined;
  const candidates = [
    ...asArray(item["media:content"]),
    ...asArray(mediaGroup?.["media:content"]),
  ].filter((node) => {
    const medium = attr(node, "medium");
    const type = attr(node, "type");
    return !medium || medium === "image" || (type ?? "").startsWith("image/");
  });
  const fromMedia = candidates.map((node) => attr(node, "url")).find(Boolean);
  const thumbnail = [...asArray(item["media:thumbnail"]), ...asArray(mediaGroup?.["media:thumbnail"])]
    .map((node) => attr(node, "url"))
    .find(Boolean);
  const enclosure = asArray(item.enclosure)
    .filter((node) => (attr(node, "type") ?? "").startsWith("image/"))
    .map((node) => attr(node, "url"))
    .find(Boolean);
  const bingImage = textOf(item["News:Image"]) || null;
  return absolutize(fromMedia ?? thumbnail ?? enclosure ?? bingImage ?? firstImgSrc(html), base);
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep CDATA/HTML bodies as raw strings; we strip HTML ourselves.
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
});

/**
 * Parses an RSS 2.0, RSS 1.0/RDF or Atom document. Throws when the text
 * isn't a recognizable feed (e.g. an HTML page served at a moved feed URL).
 */
export function parseFeed(xml: string, feedUrl: string | null = null): ParsedFeed {
  let doc: Record<string, unknown>;
  try {
    doc = xmlParser.parse(xml) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Not a valid feed (${error instanceof Error ? error.message : "parse error"}).`);
  }

  const rss = doc.rss as Record<string, unknown> | undefined;
  const rdf = doc["rdf:RDF"] as Record<string, unknown> | undefined;
  const atom = doc.feed as Record<string, unknown> | undefined;

  if (rss || rdf) {
    const channel = ((rss?.channel ?? rdf?.channel) ?? {}) as Record<string, unknown>;
    const items = asArray((rss ? channel.item : rdf?.item) as Record<string, unknown> | Record<string, unknown>[]);
    const base = absolutize(textOf(channel.link), feedUrl) ?? feedUrl;
    return {
      title: htmlToPlainText(textOf(channel.title)) || null,
      entries: items.flatMap((item): ParsedFeedEntry[] => {
        const link = absolutize(textOf(item.link) || attr(item, "rdf:about") || textOf(item.guid), base);
        const title = htmlToPlainText(textOf(item.title));
        if (!link || !title) return [];
        const html = textOf(item["content:encoded"]) || textOf(item.description);
        return [
          {
            title,
            link,
            summary: htmlToPlainText(textOf(item.description) || html),
            publishedAt: parseDate(textOf(item.pubDate) || textOf(item["dc:date"])),
            imageUrl: feedItemImage(item, html, link),
          },
        ];
      }),
    };
  }

  if (atom) {
    const entries = asArray(atom.entry as Record<string, unknown> | Record<string, unknown>[]);
    return {
      title: htmlToPlainText(textOf(atom.title)) || null,
      entries: entries.flatMap((entry): ParsedFeedEntry[] => {
        const links = asArray(entry.link);
        const alternate =
          links.find((node) => !attr(node, "rel") || attr(node, "rel") === "alternate") ?? links[0];
        const link = absolutize(attr(alternate, "href") ?? textOf(alternate), feedUrl);
        const title = htmlToPlainText(textOf(entry.title));
        if (!link || !title) return [];
        const html = textOf(entry.content) || textOf(entry.summary);
        return [
          {
            title,
            link,
            summary: htmlToPlainText(textOf(entry.summary) || html),
            publishedAt: parseDate(textOf(entry.published) || textOf(entry.updated)),
            imageUrl: feedItemImage(entry, html, link),
          },
        ];
      }),
    };
  }

  throw new Error("Not an RSS or Atom feed.");
}

export type PagePreview = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  canonicalUrl: string | null;
};

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/**
 * Link-preview metadata from an article page's <head>: Open Graph tags,
 * then Twitter card tags, then <title>/<meta name="description">. Reads only
 * metadata — never the page body.
 */
export function parsePagePreview(html: string, pageUrl: string): PagePreview {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 200_000);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content.trim());
  }
  let canonical: string | null = null;
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = parseAttributes(tag);
    if ((attrs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical") && attrs.href) {
      canonical = absolutize(attrs.href, pageUrl);
      break;
    }
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const pick = (...keys: string[]) => keys.map((key) => meta.get(key)).find((value) => value) ?? null;
  const title = pick("og:title", "twitter:title") ?? (titleTag ? htmlToPlainText(titleTag[1]) : null);
  const description = pick("og:description", "twitter:description", "description");
  return {
    title: title ? htmlToPlainText(title) : null,
    description: description ? htmlToPlainText(description) : null,
    imageUrl: absolutize(pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"), pageUrl),
    siteName: pick("og:site_name", "application-name"),
    canonicalUrl: canonical,
  };
}

/** "www.sciencedaily.com" → "sciencedaily.com" — fallback publisher name. */
export function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Bing News titles carry no suffix, but many aggregator/feeds append
 * " - Publisher" to the headline; strip a trailing " - {publisher}" when it
 * matches the known publisher name.
 */
export function stripPublisherSuffix(title: string, publisher: string | null): string {
  if (!publisher) return title;
  const suffix = ` - ${publisher}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}
