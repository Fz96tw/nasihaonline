import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { openCuratedArticle } from "@/lib/curated-articles-server";

/**
 * GET /from-the-web/:id/open — the link behind a "From the Web" row and its
 * "Read on…" link. Records that the signed-in member opened the article
 * (once per member — the row's eye-icon count), then forwards straight to the
 * publisher's own link. A plain page route, not under /api, so it behaves
 * like any other link; only published articles are forwarded.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser().catch(() => null);
  const target = await openCuratedArticle(params.id, user && !user.suspended ? user.id : null);
  if (!target) return new NextResponse("Article not found.", { status: 404 });
  return NextResponse.redirect(target, {
    status: 302,
    // Per-member counting: never let a shared cache answer for someone else.
    headers: { "Cache-Control": "private, no-store" },
  });
}
