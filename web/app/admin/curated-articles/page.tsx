import Link from "next/link";
import { db } from "@/lib/db";
import { ExternalArticleStatus } from "@/lib/generated/prisma/enums";
import { getCuratedArticlesFetchEnabled } from "@/lib/settings";
import { getCuratedArticleCounts, listCuratedArticles } from "@/lib/curated-articles-server";
import { EXTERNAL_ARTICLE_STATUS_LABELS } from "@/lib/curated-articles";
import { CuratedArticlesShell, curatedArticlesAdminGate } from "@/lib/curated-articles-page";
import { AddArticleByUrlForm, CuratedArticleList, CuratedFetchControls } from "@/components/admin/curated-article-queue";

const STATUSES = [ExternalArticleStatus.pending, ExternalArticleStatus.approved, ExternalArticleStatus.rejected] as const;

const EMPTY_TEXT: Record<ExternalArticleStatus, string> = {
  pending: "Nothing waiting for review. Turn on fetching, use “Fetch now”, or add an article by link.",
  approved: "No approved articles yet.",
  rejected: "No rejected articles.",
};

/**
 * From the Web, review queue: fetched (and admin-added) articles waiting for a
 * decision, plus the approved and rejected lists. Only approved articles reach
 * the What's New feed. Admin-only.
 */
export default async function AdminCuratedArticlesPage({ searchParams }: { searchParams: { status?: string } }) {
  const forbidden = await curatedArticlesAdminGate();
  if (forbidden) return forbidden;

  const status = (STATUSES as readonly string[]).includes(searchParams.status ?? "")
    ? (searchParams.status as ExternalArticleStatus)
    : ExternalArticleStatus.pending;
  const [fetchEnabled, counts, list, communities] = await Promise.all([
    getCuratedArticlesFetchEnabled(),
    getCuratedArticleCounts(),
    listCuratedArticles(status),
    db.community.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <CuratedArticlesShell
      current="/admin/curated-articles"
      description="Articles from around the web to share with members in What's New. Approve the ones worth reading; each gets a Discuss button for members."
    >
      <CuratedFetchControls enabled={fetchEnabled} />
      <AddArticleByUrlForm communities={communities} />
      <section className="flex flex-col gap-4" aria-labelledby="curated-queue-heading">
        <h2 id="curated-queue-heading" className="text-xl font-semibold">
          Articles
        </h2>
        <nav aria-label="Article status" className="flex flex-wrap gap-2">
          {STATUSES.map((value) => (
            <Link
              key={value}
              href={`/admin/curated-articles?status=${value}`}
              aria-current={value === status ? "page" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                value === status ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {EXTERNAL_ARTICLE_STATUS_LABELS[value]} ({counts[value]})
            </Link>
          ))}
        </nav>
        {list.total > list.items.length && (
          <p className="text-sm text-muted-foreground">
            Showing the {list.items.length} most recent of {list.total}.
          </p>
        )}
        <CuratedArticleList items={list.items} communities={communities} emptyText={EMPTY_TEXT[status]} />
      </section>
    </CuratedArticlesShell>
  );
}
