import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { PostCommentError, flagPostComment } from "@/lib/blog-server";
import { flagContentSchema } from "@/lib/validation/flag";

/**
 * POST /api/blog/comments/:commentId/flag — community flagging on an
 * individual comment (§4.8), member-auth only. Mirrors
 * /api/forums/posts/:postId/flag: any member (including the comment's own
 * author) can flag it; it routes into the same shared moderation model
 * (§4.11) but the comment stays visible until a moderator/admin resolves it.
 */
export async function POST(request: Request, { params }: { params: { commentId: string } }) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = flagContentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const comment = await flagPostComment(params.commentId, parsed.data.reason);
    return NextResponse.json({ comment });
  } catch (error) {
    if (error instanceof PostCommentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
