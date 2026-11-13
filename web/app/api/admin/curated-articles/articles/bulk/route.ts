import { NextResponse } from "next/server";
import { bulkRejectCuratedArticles, countPendingOlderThan, rejectPendingOlderThan } from "@/lib/curated-articles-server";
import { curatedArticleBulkSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

/**
 * POST /api/admin/curated-articles/articles/bulk — reject the ticked
 * pending/scheduled articles (`reject-selected`), or every pending article
 * fetched more than `days` ago (`reject-older-than`). Published articles are
 * never touched.
 */
export async function POST(request: Request) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, curatedArticleBulkSchema);
    if ("response" in body) return body.response;
    const result =
      body.data.action === "reject-selected"
        ? await bulkRejectCuratedArticles(body.data.ids, admin.id)
        : await rejectPendingOlderThan(body.data.days, admin.id);
    return NextResponse.json(result);
  });
}

/** GET /api/admin/curated-articles/articles/bulk?olderThanDays=N — how many pending articles that would reject. */
export async function GET(request: Request) {
  return withCuratedAdmin(async () => {
    const days = Number(new URL(request.url).searchParams.get("olderThanDays"));
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return NextResponse.json({ error: "Enter a number of days between 1 and 365." }, { status: 400 });
    }
    return NextResponse.json({ count: await countPendingOlderThan(days) });
  });
}
