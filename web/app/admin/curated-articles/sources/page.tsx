import { db } from "@/lib/db";
import { listArticleSources } from "@/lib/curated-articles-server";
import { CuratedArticlesShell, curatedArticlesAdminGate } from "@/lib/curated-articles-page";
import { ArticleSourceManager } from "@/components/admin/curated-article-sources";

/** From the Web, sources: the feeds and news searches the worker checks every 6 hours, with each one's last result. Admin-only. */
export default async function AdminCuratedArticleSourcesPage() {
  const forbidden = await curatedArticlesAdminGate();
  if (forbidden) return forbidden;

  const [sources, communities] = await Promise.all([
    listArticleSources(),
    db.community.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <CuratedArticlesShell
      current="/admin/curated-articles/sources"
      description="Where articles come from. Keyword rules decide which entries reach the review queue; community tags carry over to each article."
    >
      <ArticleSourceManager sources={sources} communities={communities} />
    </CuratedArticlesShell>
  );
}
