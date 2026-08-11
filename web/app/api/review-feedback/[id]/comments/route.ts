import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, postReviewComment } from "@/lib/review-server";
import { reviewCommentSchema } from "@/lib/validation/review";

/** POST /api/review-feedback/:id/comments — access-gated inside postReviewComment (submitter/invitee/moderator/admin). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = reviewCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const comment = await postReviewComment(id, user.id, parsed.data);
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
