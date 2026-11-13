import { NextResponse } from "next/server";
import { setCuratedArticleStatus } from "@/lib/curated-articles-server";
import { curatedArticleStatusSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

/**
 * POST /api/admin/curated-articles/articles/:id/status — approve (into the
 * release queue, or straight to the feed with `postNow` / for a previously
 * published article), reject, or move back to pending.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, curatedArticleStatusSchema);
    if ("response" in body) return body.response;
    const article = await setCuratedArticleStatus(params.id, admin.id, body.data.status, { postNow: body.data.postNow });
    return NextResponse.json({ article });
  });
}
