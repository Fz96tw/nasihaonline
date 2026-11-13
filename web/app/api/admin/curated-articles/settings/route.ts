import { NextResponse } from "next/server";
import { recordAdminAction } from "@/lib/audit-server";
import { setCuratedArticlesFetchEnabled, setCuratedArticlesPerCommunityPerWeek } from "@/lib/settings";
import { curatedArticleSettingsSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

/**
 * PATCH /api/admin/curated-articles/settings — turn the 6-hourly fetch on or
 * off, and/or set how many articles each community publishes per week.
 */
export async function PATCH(request: Request) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, curatedArticleSettingsSchema);
    if ("response" in body) return body.response;
    const { curatedArticlesFetchEnabled, curatedArticlesPerCommunityPerWeek } = body.data;
    if (curatedArticlesFetchEnabled !== undefined) {
      await setCuratedArticlesFetchEnabled(curatedArticlesFetchEnabled);
      await recordAdminAction({
        actorId: admin.id,
        action: curatedArticlesFetchEnabled ? "curated_articles.fetch_enabled" : "curated_articles.fetch_disabled",
        entityType: "SiteSettings",
      });
    }
    if (curatedArticlesPerCommunityPerWeek !== undefined) {
      await setCuratedArticlesPerCommunityPerWeek(curatedArticlesPerCommunityPerWeek);
      await recordAdminAction({
        actorId: admin.id,
        action: "curated_articles.cadence_changed",
        entityType: "SiteSettings",
        metadata: { perWeek: curatedArticlesPerCommunityPerWeek },
      });
    }
    return NextResponse.json({ ok: true });
  });
}
