// Client-safe shapes for curated "From the Web" articles — mirrors the
// lib/feed.ts / lib/feed-server.ts split: plain types and helpers here, DB
// access in lib/curated-articles-server.ts and lib/curated-article-fetch.ts.

import type { ArticleSourceKind, ExternalArticleStatus } from "@/lib/generated/prisma/enums";

export const ARTICLE_SOURCE_KIND_LABELS: Record<ArticleSourceKind, string> = {
  rss: "RSS / Atom feed",
  news_search: "News search",
};

export const EXTERNAL_ARTICLE_STATUS_LABELS: Record<ExternalArticleStatus, string> = {
  pending: "Pending review",
  scheduled: "Scheduled",
  approved: "Published",
  rejected: "Rejected",
};

/** MinIO key prefix (attachments bucket) of cached article thumbnails. */
export const CURATED_ARTICLE_IMAGE_PREFIX = "curated-article/";

/** Browser-facing URL of a cached article thumbnail (proxied from MinIO). */
export function getCuratedArticleImageUrl(key: string | null): string | null {
  if (!key) return null;
  return `/api/curated-articles/image/${key}`;
}

/** The member-facing link to a curated article: records the open, then forwards to the publisher. */
export function curatedArticleOpenHref(articleId: string): string {
  return `/from-the-web/${articleId}/open`;
}

/** Shown when an article has no usable image of its own. */
export const CURATED_ARTICLE_PLACEHOLDER_IMAGE = "/images/from-the-web.svg";

export type CommunityOption = { id: string; name: string };

export type ArticleSourceDto = {
  id: string;
  name: string;
  kind: ArticleSourceKind;
  url: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  enabled: boolean;
  communityIds: string[];
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastNewCount: number | null;
  pendingCount: number;
  approvedCount: number;
};

export type ExternalArticleDto = {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  sourceName: string;
  sourceId: string | null;
  feedSourceName: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  imageUrl: string | null;
  status: ExternalArticleStatus;
  /** When it joined the release queue (scheduled articles). */
  scheduledAt: string | null;
  /** When it first reached the feed; kept after unpublishing. */
  approvedAt: string | null;
  /** Scheduled tab only: the worker's estimated release time. */
  estimatedReleaseAt?: string | null;
  communityIds: string[];
  threadId: string | null;
  replyCount: number;
};
