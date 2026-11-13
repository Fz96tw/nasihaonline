import { NextResponse } from "next/server";
import { createArticleSource } from "@/lib/curated-articles-server";
import { articleSourceSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

/** POST /api/admin/curated-articles/sources — add a feed or news search. */
export async function POST(request: Request) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, articleSourceSchema);
    if ("response" in body) return body.response;
    const source = await createArticleSource(admin.id, body.data);
    return NextResponse.json({ source }, { status: 201 });
  });
}
