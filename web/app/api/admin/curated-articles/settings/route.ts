import { NextResponse } from "next/server";
import { recordAdminAction } from "@/lib/audit-server";
import { setCuratedArticlesFetchEnabled } from "@/lib/settings";
import { curatedArticleSettingsSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

/** PATCH /api/admin/curated-articles/settings — turn the 6-hourly fetch on or off. */
export async function PATCH(request: Request) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, curatedArticleSettingsSchema);
    if ("response" in body) return body.response;
    await setCuratedArticlesFetchEnabled(body.data.curatedArticlesFetchEnabled);
    await recordAdminAction({
      actorId: admin.id,
      action: body.data.curatedArticlesFetchEnabled ? "curated_articles.fetch_enabled" : "curated_articles.fetch_disabled",
      entityType: "SiteSettings",
    });
    return NextResponse.json({ ok: true });
  });
}
