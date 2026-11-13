// No "server-only" guard: imported by scripts/worker.ts, which runs outside
// Next's server runtime — same convention as lib/weekly-reflection-job.ts.
// lib/storage.ts is server-only, which is why the thumbnail cache below talks
// to MinIO itself (same bucket, env vars and proxy route as the other
// attachments).

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Client as MinioClient } from "minio";
import sharp from "sharp";
import { db } from "@/lib/db";
import { ArticleSourceKind, ExternalArticleStatus } from "@/lib/generated/prisma/enums";
import { getCuratedArticlesFetchEnabled, getCuratedArticlesPendingRetentionDays } from "@/lib/settings";
import { CURATED_ARTICLE_IMAGE_PREFIX } from "@/lib/curated-articles";
import { createHostPacer } from "@/lib/host-pacer";
import {
  ARTICLE_EXCERPT_MAX,
  ARTICLE_TITLE_MAX,
  MAX_BODY_IMAGE_CANDIDATES,
  buildNewsSearchFeedUrl,
  cleanArticleLink,
  hostnameLabel,
  matchesKeywordRules,
  normalizeArticleUrl,
  parseFeed,
  parsePagePreview,
  stripPublisherSuffix,
  truncateText,
  unwrapAggregatorLink,
  type PagePreview,
} from "@/lib/curated-article-parse";

const USER_AGENT = process.env.CURATED_ARTICLES_USER_AGENT || "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
// Only the <head> is read; most pages put it well inside the first few hundred KB.
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Same cap as the app's other image uploads (lib/storage.ts). */
const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;
const THUMBNAIL_WIDTH_PX = 1200;

/**
 * Entries older than this are ignored — a newly added source doesn't backfill
 * its whole archive. Shortened to the admin's pending-retention setting when
 * that's lower, so an entry the cleanup deleted has also aged out of the
 * fetch window and isn't re-queued.
 */
const MAX_ENTRY_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Per source per run, so one noisy feed can't flood the review queue. */
const MAX_NEW_PER_SOURCE = 5;
/** Article-page fetches per source per run (link previews for entries missing an image/summary). */
const MAX_PREVIEW_FETCHES_PER_SOURCE = 15;

export class ArticleFetchError extends Error {}

// ---------------------------------------------------------------------------
// Outbound HTTP. Feed entries are third-party data, so every URL we fetch —
// feed, article page, image, and each redirect hop — must resolve to a public
// address: a hostile feed must not be able to point the worker at MinIO,
// Redis, Postgres or a cloud metadata endpoint on the private network.
// ---------------------------------------------------------------------------

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIPv4(address);
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") || // unique local
    /^fe[89ab]/.test(lower) || // link-local
    lower.startsWith("ff") // multicast
  );
}

/** Throws unless `url` is http(s) on a standard port and every address its host resolves to is public. */
export async function assertPublicHttpUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ArticleFetchError("Only http and https links are supported.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new ArticleFetchError("Links on non-standard ports aren't supported.");
  }
  if (url.username || url.password) throw new ArticleFetchError("Links with credentials aren't supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0) throw new ArticleFetchError(`Couldn't resolve ${host}.`);
  if (addresses.some(isPrivateAddress)) throw new ArticleFetchError(`${host} points at a private network address.`);
}

export type SafeResponse = { status: number; url: string; headers: Headers; body: Buffer };
export type HttpGetOptions = { maxBytes: number; accept: string; headers?: Record<string, string>; truncateOk?: boolean };
/** The outbound GET every fetch goes through — injectable so tests can run a fetch without the network. */
export type HttpGet = (url: string, options: HttpGetOptions) => Promise<SafeResponse>;

/**
 * GET with the public-address check on every hop, a timeout, and a hard cap
 * on bytes read (the rest of the body is discarded unread). A 304 comes back
 * with an empty body.
 */
// One pacer per process: at least 1.5s between requests to the same host
// (lib/host-pacer.ts), every redirect hop included.
const paceHost = createHostPacer();

export async function safeGet(rawUrl: string, options: HttpGetOptions): Promise<SafeResponse> {
  let current = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(current);
    await paceHost(current.hostname);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: options.accept, ...options.headers },
      });
    } catch (error) {
      // Node's fetch reports every network failure as "fetch failed"; the
      // useful part (timeout, DNS, TLS, reset) is in its cause.
      const cause = error instanceof Error ? (error.cause as { code?: string; message?: string } | undefined) : undefined;
      const detail =
        error instanceof Error && error.name === "TimeoutError"
          ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
          : (cause?.code ?? cause?.message ?? (error instanceof Error ? error.message : "network error"));
      throw new ArticleFetchError(`Couldn't reach ${current.hostname} (${detail}).`);
    }
    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new ArticleFetchError(`HTTP ${response.status} without a Location header.`);
      current = new URL(location, current);
      continue;
    }
    if (response.status === 304) {
      await response.body?.cancel();
      return { status: 304, url: current.toString(), headers: response.headers, body: Buffer.alloc(0) };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ArticleFetchError(`HTTP ${response.status} from ${current.hostname}.`);
    }
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (!options.truncateOk && declared > options.maxBytes) {
      await response.body?.cancel();
      throw new ArticleFetchError(`Response from ${current.hostname} is too large.`);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > options.maxBytes) {
          await reader.cancel();
          if (!options.truncateOk) throw new ArticleFetchError(`Response from ${current.hostname} is too large.`);
          chunks.push(Buffer.from(value.subarray(0, value.byteLength - (total - options.maxBytes))));
          break;
        }
        chunks.push(Buffer.from(value));
      }
    }
    return { status: response.status, url: current.toString(), headers: response.headers, body: Buffer.concat(chunks) };
  }
  throw new ArticleFetchError("Too many redirects.");
}

/** An article page's link-preview metadata (Open Graph etc.) — only the <head> is read. */
export async function fetchPagePreview(url: string, get: HttpGet = safeGet): Promise<PagePreview & { finalUrl: string }> {
  const response = await get(url, {
    maxBytes: MAX_PAGE_BYTES,
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    truncateOk: true,
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/html|xml/i.test(contentType)) {
    throw new ArticleFetchError("That link isn't a web page.");
  }
  return { ...parsePagePreview(response.body.toString("utf8"), response.url), finalUrl: response.url };
}

// ---------------------------------------------------------------------------
// Thumbnail cache — a resized WebP copy in our own MinIO, so the feed never
// hotlinks a publisher (no broken images when they rotate files, and no
// member IPs sent to third parties). Served through /api/curated-articles/
// image/[...key], same proxy shape as the other hero images.
// ---------------------------------------------------------------------------

const BUCKET_ATTACHMENTS = process.env.MINIO_BUCKET_ATTACHMENTS || "attachments";
let minio: MinioClient | undefined;
let bucketEnsured = false;

function getMinio(): MinioClient {
  if (!minio) {
    minio = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || "localhost",
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  }
  return minio;
}

async function ensureAttachmentsBucket(client: MinioClient) {
  if (bucketEnsured) return;
  const exists = await client.bucketExists(BUCKET_ATTACHMENTS).catch(() => false);
  if (!exists) await client.makeBucket(BUCKET_ATTACHMENTS);
  bucketEnsured = true;
}

/** Stores an already-downloaded image as a resized WebP; returns its object key. Throws if it isn't a decodable image. */
export async function storeArticleImage(input: Buffer): Promise<string> {
  let output: Buffer;
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error("no dimensions");
    // Tiny images are icons/tracking pixels, not article photos.
    if (metadata.width < 200 || metadata.height < 100) throw new ArticleFetchError("That image is too small (it needs to be at least 200×100 pixels).");
    output = await image
      .rotate()
      .resize({ width: THUMBNAIL_WIDTH_PX, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    if (error instanceof ArticleFetchError) throw error;
    throw new ArticleFetchError("That file isn't a supported image.");
  }
  const client = getMinio();
  await ensureAttachmentsBucket(client);
  const key = `${CURATED_ARTICLE_IMAGE_PREFIX}${crypto.randomUUID()}.webp`;
  await client.putObject(BUCKET_ATTACHMENTS, key, output, output.length, { "Content-Type": "image/webp" });
  return key;
}

let storageErrorLogged = false;

/**
 * Downloads `imageUrl` and caches it; null (never throws) when it can't be
 * used. A bad or unreachable image is expected and skipped quietly, but a
 * storage failure (MinIO unreachable or misconfigured) is logged once per
 * process, since it means *every* article is silently losing its image.
 */
export async function cacheArticleImage(imageUrl: string, get: HttpGet = safeGet): Promise<string | null> {
  let body: Buffer;
  try {
    body = (await get(imageUrl, { maxBytes: MAX_IMAGE_BYTES, accept: "image/avif,image/webp,image/*;q=0.8" })).body;
  } catch {
    return null;
  }
  try {
    return await storeArticleImage(body);
  } catch (error) {
    if (!(error instanceof ArticleFetchError) && !storageErrorLogged) {
      storageErrorLogged = true;
      console.error("[curated-articles] couldn't store an article image — check the MinIO settings:", error);
    }
    return null;
  }
}

/**
 * Looks up and caches an image for published/queued articles that have none
 * (link-preview image, then the article-body fallback). For recovering after
 * images couldn't be stored; run via scripts/backfill-curated-article-images.ts.
 */
export async function backfillMissingArticleImages(
  options: { limit?: number; get?: HttpGet } = {},
): Promise<{ checked: number; filled: number }> {
  const get = options.get ?? safeGet;
  const articles = await db.externalArticle.findMany({
    where: { imageKey: null, status: { not: ExternalArticleStatus.rejected } },
    select: { id: true, url: true },
    orderBy: { fetchedAt: "desc" },
    take: options.limit ?? 500,
  });
  let filled = 0;
  for (const article of articles) {
    let preview: Awaited<ReturnType<typeof fetchPagePreview>>;
    try {
      preview = await fetchPagePreview(article.url, get);
    } catch {
      continue;
    }
    const candidates = [
      ...(preview.imageUrl && !(await isGenericSiteImage(preview.imageUrl)) ? [preview.imageUrl] : []),
      ...preview.bodyImageUrls,
    ];
    const cached = await cacheFirstImage(candidates, get);
    if (!cached) continue;
    const result = await db.externalArticle.updateMany({
      where: { id: article.id, imageKey: null },
      data: { imageKey: cached.key, originalImageUrl: cached.sourceUrl },
    });
    if (result.count > 0) filled++;
    else await deleteArticleImage(cached.key);
  }
  return { checked: articles.length, filled };
}

/**
 * Tries image URLs in order and caches the first one that downloads, decodes
 * and passes the size check — the article-body fallback. Null when none do.
 */
export async function cacheFirstImage(
  candidates: string[],
  get: HttpGet = safeGet,
): Promise<{ key: string; sourceUrl: string } | null> {
  for (const candidate of candidates.slice(0, MAX_BODY_IMAGE_CANDIDATES + 1)) {
    const key = await cacheArticleImage(candidate, get);
    if (key) return { key, sourceUrl: candidate };
  }
  return null;
}

/**
 * An admin's uploaded replacement image: size-capped here, then the same
 * decode/minimum-size checks and resize as fetched images.
 */
export async function storeUploadedArticleImage(input: Buffer): Promise<string> {
  if (input.length > MAX_UPLOAD_IMAGE_BYTES) throw new ArticleFetchError("Images can be at most 5MB.");
  return storeArticleImage(input);
}

/** An admin's pasted image link: fetched through the same public-address guard. Throws ArticleFetchError with the reason. */
export async function storeLinkedArticleImage(imageUrl: string, get: HttpGet = safeGet): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    throw new ArticleFetchError("Enter the image's full http(s) link.");
  }
  const response = await get(parsed.toString(), { maxBytes: MAX_IMAGE_BYTES, accept: "image/avif,image/webp,image/*;q=0.8" });
  return storeArticleImage(response.body);
}

export async function deleteArticleImage(key: string | null): Promise<void> {
  if (!key || !key.startsWith(CURATED_ARTICLE_IMAGE_PREFIX)) return;
  const client = getMinio();
  await client.removeObject(BUCKET_ATTACHMENTS, key).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// The fetch run.
// ---------------------------------------------------------------------------

/**
 * Images a site uses on every page (its logo/social card) aren't article
 * images. Seen for 3+ articles from the same publisher → treated as generic.
 */
async function isGenericSiteImage(originalImageUrl: string): Promise<boolean> {
  const uses = await db.externalArticle.count({ where: { originalImageUrl } });
  return uses >= 3;
}

export type SourceFetchResult =
  | { sourceId: string; name: string; status: "ok"; newCount: number; seen: number; notModified: boolean }
  | { sourceId: string; name: string; status: "error"; error: string };

export type CuratedFetchRunResult =
  | { status: "disabled" }
  | { status: "ran"; sources: SourceFetchResult[]; newCount: number; prunedCount: number };

type SourceForFetch = {
  id: string;
  name: string;
  kind: ArticleSourceKind;
  url: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  etag: string | null;
  lastModified: string | null;
  communities: { communityId: string }[];
};

function sourceFeedUrl(source: Pick<SourceForFetch, "kind" | "url">): string {
  return source.kind === ArticleSourceKind.news_search ? buildNewsSearchFeedUrl(source.url) : source.url;
}

async function fetchOneSource(source: SourceForFetch, now: Date, get: HttpGet, entryWindowDays: number): Promise<SourceFetchResult> {
  const response = await get(sourceFeedUrl(source), {
    maxBytes: MAX_FEED_BYTES,
    accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
    headers: {
      ...(source.etag ? { "If-None-Match": source.etag } : {}),
      ...(source.lastModified ? { "If-Modified-Since": source.lastModified } : {}),
    },
  });
  if (response.status === 304) {
    await db.articleSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: now, lastSuccessAt: now, lastError: null, consecutiveFailures: 0, lastNewCount: 0 },
    });
    return { sourceId: source.id, name: source.name, status: "ok", newCount: 0, seen: 0, notModified: true };
  }

  const feed = parseFeed(response.body.toString("utf8"), response.url);
  const cutoff = now.getTime() - entryWindowDays * DAY_MS;
  const candidates = feed.entries
    .filter((entry) => !entry.publishedAt || entry.publishedAt.getTime() >= cutoff)
    .filter((entry) => matchesKeywordRules(`${entry.title} ${entry.summary}`, source))
    .flatMap((entry) => {
      const publisherLink = unwrapAggregatorLink(entry.link);
      const url = normalizeArticleUrl(publisherLink);
      return url ? [{ ...entry, url, linkUrl: cleanArticleLink(publisherLink) ?? url }] : [];
    });

  const existing = new Set(
    (await db.externalArticle.findMany({ where: { url: { in: candidates.map((entry) => entry.url) } }, select: { url: true } })).map(
      (row) => row.url,
    ),
  );

  let newCount = 0;
  let previewFetches = 0;
  for (const entry of candidates) {
    if (newCount >= MAX_NEW_PER_SOURCE) break;
    if (existing.has(entry.url)) continue;
    existing.add(entry.url);

    let url = entry.url;
    let linkUrl = entry.linkUrl;
    let summary = entry.summary;
    let imageUrl = entry.imageUrl;
    let siteName: string | null = null;
    let bodyImageUrls: string[] = [];
    const isNewsSearch = source.kind === ArticleSourceKind.news_search;
    // News-search results come from arbitrary publishers, so always read the
    // page for its real name/image; feed entries only when something's missing.
    if ((isNewsSearch || !imageUrl || !summary) && previewFetches < MAX_PREVIEW_FETCHES_PER_SOURCE) {
      previewFetches++;
      try {
        const preview = await fetchPagePreview(url, get);
        siteName = preview.siteName;
        if (!summary && preview.description) summary = preview.description;
        if (!imageUrl && preview.imageUrl) imageUrl = preview.imageUrl;
        bodyImageUrls = preview.bodyImageUrls;
        const canonical = preview.canonicalUrl ? normalizeArticleUrl(preview.canonicalUrl) : null;
        if (canonical && canonical !== url) {
          if (existing.has(canonical) || (await db.externalArticle.count({ where: { url: canonical } })) > 0) continue;
          existing.add(canonical);
          url = canonical;
          linkUrl = cleanArticleLink(preview.canonicalUrl as string) ?? canonical;
        }
      } catch {
        // A page we can't read still gets queued, with whatever the feed gave us.
      }
    }

    const sourceName = isNewsSearch ? (siteName ?? hostnameLabel(url)) : source.name;
    const usableImage = imageUrl && !(await isGenericSiteImage(imageUrl)) ? imageUrl : null;
    let cachedImage: { key: string; sourceUrl: string } | null = null;
    if (usableImage) {
      const key = await cacheArticleImage(usableImage, get);
      if (key) cachedImage = { key, sourceUrl: usableImage };
    }
    // Neither the feed nor the link-preview tags gave a usable image: fall
    // back to the first suitable photo in the article body.
    if (!cachedImage) cachedImage = await cacheFirstImage(bodyImageUrls, get);
    const imageKey = cachedImage?.key ?? null;

    try {
      await db.externalArticle.create({
        data: {
          sourceId: source.id,
          url,
          linkUrl,
          title: truncateText(stripPublisherSuffix(entry.title, sourceName), ARTICLE_TITLE_MAX),
          excerpt: truncateText(summary, ARTICLE_EXCERPT_MAX),
          sourceName,
          publishedAt: entry.publishedAt,
          imageKey,
          originalImageUrl: cachedImage?.sourceUrl ?? null,
          status: ExternalArticleStatus.pending,
          fetchedAt: now,
          communities: { create: source.communities.map((c) => ({ communityId: c.communityId })) },
        },
      });
      newCount++;
    } catch (error) {
      // Unique-URL race with a concurrent run or another source — already stored.
      await deleteArticleImage(imageKey);
      if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002")) throw error;
    }
  }

  await db.articleSource.update({
    where: { id: source.id },
    data: {
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      lastFetchedAt: now,
      lastSuccessAt: now,
      lastError: null,
      consecutiveFailures: 0,
      lastNewCount: newCount,
    },
  });
  return { sourceId: source.id, name: source.name, status: "ok", newCount, seen: feed.entries.length, notModified: false };
}

const SOURCE_FOR_FETCH_SELECT = {
  id: true,
  name: true,
  kind: true,
  url: true,
  includeKeywords: true,
  excludeKeywords: true,
  etag: true,
  lastModified: true,
  communities: { select: { communityId: true } },
} as const;

/**
 * One fetch pass over every enabled source (or just `sourceIds`). Sources run
 * one at a time, each in its own try/catch: a failing source records its
 * error on its own row and the run moves on. `force` skips the site-wide
 * on/off switch (the admin's "Fetch now" button).
 */
export async function runCuratedArticleFetch(
  options: { now?: Date; sourceIds?: string[]; force?: boolean; get?: HttpGet } = {},
): Promise<CuratedFetchRunResult> {
  const now = options.now ?? new Date();
  if (!options.force && !(await getCuratedArticlesFetchEnabled())) return { status: "disabled" };
  const retentionDays = await getCuratedArticlesPendingRetentionDays();
  const entryWindowDays = Math.min(MAX_ENTRY_AGE_DAYS, retentionDays);

  const sources = await db.articleSource.findMany({
    where: { enabled: true, ...(options.sourceIds ? { id: { in: options.sourceIds } } : {}) },
    select: SOURCE_FOR_FETCH_SELECT,
    orderBy: { name: "asc" },
  });

  const results: SourceFetchResult[] = [];
  for (const source of sources) {
    try {
      results.push(await fetchOneSource(source, now, options.get ?? safeGet, entryWindowDays));
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      await db.articleSource
        .update({
          where: { id: source.id },
          data: { lastFetchedAt: now, lastError: message, consecutiveFailures: { increment: 1 } },
        })
        .catch(() => undefined);
      results.push({ sourceId: source.id, name: source.name, status: "error", error: message });
    }
  }
  const prunedCount = await pruneStalePendingArticles(now, retentionDays);
  return {
    status: "ran",
    sources: results,
    newCount: results.reduce((sum, r) => sum + (r.status === "ok" ? r.newCount : 0), 0),
    prunedCount,
  };
}

/**
 * Deletes pending articles fetched more than the admin-configured retention
 * ago (default 30 days), with their cached images: the queue is a "what's
 * new" inbox, not an archive. Only `pending` — scheduled, published and
 * rejected articles are never touched.
 */
export async function pruneStalePendingArticles(now: Date = new Date(), retentionDays?: number): Promise<number> {
  const days = retentionDays ?? (await getCuratedArticlesPendingRetentionDays());
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const stale = await db.externalArticle.findMany({
    where: { status: ExternalArticleStatus.pending, fetchedAt: { lt: cutoff } },
    select: { id: true, imageKey: true },
    take: 500,
  });
  if (stale.length === 0) return 0;
  await db.externalArticle.deleteMany({ where: { id: { in: stale.map((row) => row.id) }, status: ExternalArticleStatus.pending } });
  for (const row of stale) await deleteArticleImage(row.imageKey);
  return stale.length;
}

/**
 * Builds a pending article from one URL an admin pasted: reads the page's
 * link-preview metadata and caches its image. Throws ArticleFetchError with
 * an admin-readable message when the page can't be used.
 */
export async function previewArticleFromUrl(rawUrl: string, get: HttpGet = safeGet): Promise<{
  url: string;
  /** The publisher's link to send members to (see ExternalArticle.linkUrl). */
  linkUrl: string;
  title: string;
  excerpt: string;
  sourceName: string;
  imageUrl: string | null;
  bodyImageUrls: string[];
}> {
  const normalized = normalizeArticleUrl(rawUrl);
  if (!normalized) throw new ArticleFetchError("Enter a full http(s) link.");
  // Request the link as the admin pasted it (minus tracking parameters), not
  // the dedupe form, so we don't trigger the publisher's slash redirect.
  const preview = await fetchPagePreview(cleanArticleLink(rawUrl) ?? normalized, get);
  const canonical = preview.canonicalUrl ? normalizeArticleUrl(preview.canonicalUrl) : null;
  const url = canonical ?? normalizeArticleUrl(preview.finalUrl) ?? normalized;
  if (!preview.title) throw new ArticleFetchError("Couldn't find a title on that page.");
  const sourceName = preview.siteName ?? hostnameLabel(url);
  return {
    url,
    linkUrl: cleanArticleLink(canonical ? (preview.canonicalUrl as string) : preview.finalUrl) ?? url,
    title: truncateText(stripPublisherSuffix(preview.title, sourceName), ARTICLE_TITLE_MAX),
    excerpt: truncateText(preview.description ?? "", ARTICLE_EXCERPT_MAX),
    sourceName,
    imageUrl: preview.imageUrl,
    bodyImageUrls: preview.bodyImageUrls,
  };
}
