import Link from "next/link";
import { db } from "@/lib/db";
import { ExternalArticleStatus } from "@/lib/generated/prisma/enums";
import { getCuratedArticlesFetchEnabled, getCuratedArticlesPendingRetentionDays } from "@/lib/settings";
import { getCuratedArticleCounts, listArticleSourceOptions, listCuratedArticles } from "@/lib/curated-articles-server";
import { parseQueueParams, queueHref, showingRange, type QueueSort } from "@/lib/curated-queue-params";
import { QueueSourceFilter } from "@/components/admin/curated-queue-controls";
import { Button } from "@/components/ui/button";
import { getScheduledOverview } from "@/lib/curated-articles-release";
import { EXTERNAL_ARTICLE_STATUS_LABELS } from "@/lib/curated-articles";
import { CuratedArticlesShell, curatedArticlesAdminGate } from "@/lib/curated-articles-page";
import {
  AddArticleByUrlForm,
  CuratedArticleList,
  CuratedFetchControls,
  ScheduledOverviewPanel,
} from "@/components/admin/curated-article-queue";

const STATUSES = [
  ExternalArticleStatus.pending,
  ExternalArticleStatus.scheduled,
  ExternalArticleStatus.approved,
  ExternalArticleStatus.rejected,
] as const;

const EMPTY_TEXT: Record<ExternalArticleStatus, string> = {
  pending: "Nothing waiting for review. Turn on fetching, use “Fetch now”, or add an article by link.",
  scheduled: "Nothing scheduled. Approved articles wait here until their community's next release slot.",
  approved: "No published articles yet.",
  rejected: "No rejected articles.",
};

/**
 * From the Web, review queue: fetched (and admin-added) articles waiting for a
 * decision, plus the approved and rejected lists. Only approved articles reach
 * the What's New feed. Admin-only.
 */
const SORT_LABELS: Record<QueueSort, string> = { newest: "Newest first", oldest: "Oldest first" };

export default async function AdminCuratedArticlesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const forbidden = await curatedArticlesAdminGate();
  if (forbidden) return forbidden;

  const requested = parseQueueParams(searchParams);
  const status = requested.status as ExternalArticleStatus;
  const [fetchEnabled, retentionDays, counts, list, communities, overview, sources] = await Promise.all([
    getCuratedArticlesFetchEnabled(),
    getCuratedArticlesPendingRetentionDays(),
    getCuratedArticleCounts(),
    listCuratedArticles(status, { page: requested.page, sort: requested.sort, source: requested.source }),
    db.community.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getScheduledOverview(),
    listArticleSourceOptions(),
  ]);
  // The page actually shown (an out-of-range request lands on the last page).
  const params = { ...requested, page: list.page };
  const range = showingRange(list.page, list.total);
  const items =
    status === ExternalArticleStatus.scheduled
      ? list.items.map((item) => ({ ...item, estimatedReleaseAt: overview.estimates[item.id] ?? null }))
      : list.items;

  return (
    <CuratedArticlesShell
      current="/admin/curated-articles"
      description="Articles from around the web to share with members in What's New. Approved articles are published a few at a time per community, each with a Discuss button for members."
    >
      <CuratedFetchControls enabled={fetchEnabled} perWeek={overview.perWeek} retentionDays={retentionDays} />
      <AddArticleByUrlForm communities={communities} />
      <section className="flex flex-col gap-4" aria-labelledby="curated-queue-heading">
        <h2 id="curated-queue-heading" className="text-xl font-semibold">
          Articles
        </h2>
        <nav aria-label="Article status" className="flex flex-wrap gap-2">
          {STATUSES.map((value) => (
            <Link
              key={value}
              href={queueHref(params, { status: value })}
              aria-current={value === status ? "page" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                value === status ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {EXTERNAL_ARTICLE_STATUS_LABELS[value]} ({counts[value]})
            </Link>
          ))}
        </nav>
        {status === ExternalArticleStatus.scheduled && <ScheduledOverviewPanel slots={overview.slots} perWeek={overview.perWeek} />}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <QueueSourceFilter params={params} sources={sources} />
          <nav aria-label="Sort order" className="flex gap-1 self-start rounded-md border p-1 sm:self-auto">
            {(["newest", "oldest"] as const).map((sort) => (
              <Link
                key={sort}
                href={queueHref(params, { sort })}
                aria-current={params.sort === sort ? "true" : undefined}
                className={`rounded px-3 py-1 text-sm ${
                  params.sort === sort ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {status === ExternalArticleStatus.scheduled && sort === "oldest" ? "Release order" : SORT_LABELS[sort]}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {list.total === 0
            ? "No articles match."
            : `Showing ${range.from}–${range.to} of ${list.total}${params.source ? " from this source" : ""}.`}
        </p>
        <CuratedArticleList
          // Fresh list (and bulk selection) for every page, sort or filter.
          key={`${status}:${params.page}:${params.sort}:${params.source ?? ""}`}
          items={items}
          communities={communities}
          emptyText={EMPTY_TEXT[status]}
          selectable={status === ExternalArticleStatus.pending || status === ExternalArticleStatus.scheduled}
          showOlderThan={status === ExternalArticleStatus.pending && counts.pending > 0}
        />
        {list.pageCount > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-3">
            {params.page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={queueHref(params, { page: params.page - 1 })} rel="prev">
                  ← Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                ← Previous
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              Page {params.page} of {list.pageCount}
            </span>
            {params.page < list.pageCount ? (
              <Button asChild variant="outline" size="sm">
                <Link href={queueHref(params, { page: params.page + 1 })} rel="next">
                  Next →
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                Next →
              </Button>
            )}
          </nav>
        )}
      </section>
    </CuratedArticlesShell>
  );
}
