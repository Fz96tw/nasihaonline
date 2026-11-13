// URL parameters of the From the Web review queue (/admin/curated-articles)
// — pure, no "@/" imports, so node:test can exercise it directly
// (lib/curated-queue-params.test.ts). The page reads them; the controls build
// links with them, so the two can't disagree.

export const QUEUE_STATUSES = ["pending", "scheduled", "approved", "rejected"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];
export type QueueSort = "newest" | "oldest";
/** A source id, ADDED_BY_LINK for admin-added articles, or null for all sources. */
export type QueueSource = string | null;

export const QUEUE_PAGE_SIZE = 50;
export const ADDED_BY_LINK = "added";

/** Scheduled lists in release order (oldest approval first); every other tab newest first. */
export function defaultSort(status: QueueStatus): QueueSort {
  return status === "scheduled" ? "oldest" : "newest";
}

export type QueueParams = { status: QueueStatus; page: number; sort: QueueSort; source: QueueSource };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseQueueParams(raw: RawParams): QueueParams {
  const statusRaw = first(raw.status);
  const status: QueueStatus = (QUEUE_STATUSES as readonly string[]).includes(statusRaw ?? "") ? (statusRaw as QueueStatus) : "pending";
  const sortRaw = first(raw.sort);
  const sort: QueueSort = sortRaw === "newest" || sortRaw === "oldest" ? sortRaw : defaultSort(status);
  const pageNumber = Number.parseInt(first(raw.page) ?? "1", 10);
  const page = Number.isFinite(pageNumber) && pageNumber >= 1 ? pageNumber : 1;
  const sourceRaw = first(raw.source)?.trim();
  return { status, page, sort, source: sourceRaw ? sourceRaw : null };
}

/** Number of pages for `total` items (at least 1), and `page` clamped into range. */
export function clampPage(page: number, total: number): { page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE));
  return { page: Math.min(Math.max(1, page), pageCount), pageCount };
}

/** "Showing 51–100 of 312" bounds (1-based, inclusive); from = 0 when empty. */
export function showingRange(page: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * QUEUE_PAGE_SIZE + 1;
  return { from, to: Math.min(total, page * QUEUE_PAGE_SIZE) };
}

/**
 * The queue URL with some parameters changed. Changing the status, sort or
 * source goes back to page 1; defaults are left out to keep links short.
 */
export function queueHref(current: QueueParams, change: Partial<QueueParams>): string {
  const next: QueueParams = { ...current, ...change };
  const resetsPage = ["status", "sort", "source"].some(
    (key) => key in change && change[key as keyof QueueParams] !== current[key as keyof QueueParams],
  );
  if (resetsPage && !("page" in change)) next.page = 1;
  // Switching tab drops a sort that was only the old tab's default.
  if ("status" in change && !("sort" in change) && current.sort === defaultSort(current.status)) next.sort = defaultSort(next.status);
  const params = new URLSearchParams({ status: next.status });
  if (next.sort !== defaultSort(next.status)) params.set("sort", next.sort);
  if (next.source) params.set("source", next.source);
  if (next.page > 1) params.set("page", String(next.page));
  return `/admin/curated-articles?${params.toString()}`;
}
