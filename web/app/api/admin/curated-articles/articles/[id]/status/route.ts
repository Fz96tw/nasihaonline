import { NextResponse } from "next/server";
import { ExternalArticleStatus } from "@/lib/generated/prisma/enums";
import { setCuratedArticleStatus } from "@/lib/curated-articles-server";
import { curatedArticleStatusSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

/** POST /api/admin/curated-articles/articles/:id/status — approve, reject, or move back to pending. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, curatedArticleStatusSchema);
    if ("response" in body) return body.response;
    const article = await setCuratedArticleStatus(params.id, admin.id, body.data.status as ExternalArticleStatus);
    return NextResponse.json({ article });
  });
}
