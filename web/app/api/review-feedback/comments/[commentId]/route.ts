import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, updateReviewComment } from "@/lib/review-server";
import { enqueueReviewItemIndexSync } from "@/lib/queues/search-index-queue";

const editSchema = z.object({ body: z.string().trim().min(1, "Comment can't be empty").max(4000) });

/** PATCH /api/review-feedback/comments/:commentId — the author or a moderator/admin edits an existing comment. */
export async function PATCH(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { commentId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await updateReviewComment(commentId, user, parsed.data.body);
    await enqueueReviewItemIndexSync(result.reviewItemId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
