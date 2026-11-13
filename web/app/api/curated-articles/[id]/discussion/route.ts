import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { CuratedArticleError, startCuratedArticleDiscussion } from "@/lib/curated-articles-server";

/**
 * POST /api/curated-articles/:id/discussion — "Discuss" on an approved
 * article's feed row, any signed-in member. Idempotent, like
 * /api/library/:id/discussion: a late click resolves to the existing thread.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
  try {
    const { threadId } = await startCuratedArticleDiscussion(params.id, user.id);
    return NextResponse.json({ threadId });
  } catch (error) {
    if (error instanceof CuratedArticleError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
