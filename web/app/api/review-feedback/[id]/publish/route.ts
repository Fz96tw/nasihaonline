import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, publishReviewItemToLibrary } from "@/lib/review-server";

/**
 * POST /api/review-feedback/:id/publish — submitter-only, requires the
 * review to be closed. First call creates a pending_review KnowledgeItem
 * from the ReviewItem's fields — peer review acts as an optional pre-publish
 * quality gate, not a bypass of the normal Steward approval. A later call
 * (once already published) updates that same KnowledgeItem in place instead.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  try {
    const result = await publishReviewItemToLibrary(id, user);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
