import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ForumError, flagForumPost } from "@/lib/forums-server";

/**
 * POST /api/forums/posts/:postId/flag — community flagging (§4.13),
 * member-auth only. Any member (including the post's own author) can flag
 * it; it routes into the same shared moderation model as flagged Library
 * content (§4.9) but stays visible — no admin UI for the shared queue yet
 * (Phase 6).
 */
export async function POST(_request: Request, { params }: { params: { postId: string } }) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    const post = await flagForumPost(params.postId);
    return NextResponse.json({ post });
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
