import { NextResponse } from "next/server";
import { updateCuratedArticle } from "@/lib/curated-articles-server";
import { curatedArticleUpdateSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

/** PATCH /api/admin/curated-articles/articles/:id — edit the headline, blurb and communities. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, curatedArticleUpdateSchema);
    if ("response" in body) return body.response;
    const article = await updateCuratedArticle(params.id, admin.id, body.data);
    return NextResponse.json({ article });
  });
}
