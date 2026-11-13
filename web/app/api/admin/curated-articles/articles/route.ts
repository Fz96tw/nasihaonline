import { NextResponse } from "next/server";
import { addCuratedArticleByUrl } from "@/lib/curated-articles-server";
import { curatedArticleAddByUrlSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

/** POST /api/admin/curated-articles/articles — add one article by URL (queued as pending). */
export async function POST(request: Request) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, curatedArticleAddByUrlSchema);
    if ("response" in body) return body.response;
    const article = await addCuratedArticleByUrl(admin.id, body.data);
    return NextResponse.json({ article }, { status: 201 });
  });
}
