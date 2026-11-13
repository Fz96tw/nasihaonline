import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueManualCuratedArticlesFetch } from "@/lib/queues/curated-articles-queue";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

const fetchNowSchema = z.object({ sourceIds: z.array(z.string().min(1)).max(200).optional() });

/**
 * POST /api/admin/curated-articles/fetch — "Fetch now": queues a one-off run
 * for the worker (all enabled sources, or just `sourceIds`), whether or not
 * scheduled fetching is on. Returns immediately; new articles show up in the
 * queue once the worker finishes.
 */
export async function POST(request: Request) {
  return withCuratedAdmin(async () => {
    const body = await parseCuratedBody(request, fetchNowSchema);
    if ("response" in body) return body.response;
    await enqueueManualCuratedArticlesFetch(body.data.sourceIds);
    return NextResponse.json({ queued: true }, { status: 202 });
  });
}
