import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, flagReviewComment } from "@/lib/review-server";
import { reviewFlagSchema } from "@/lib/validation/review";

/** POST /api/review-feedback/comments/:commentId/flag — flags a comment for moderation. */
export async function POST(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { commentId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = reviewFlagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await flagReviewComment(commentId, user, parsed.data.reason);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
