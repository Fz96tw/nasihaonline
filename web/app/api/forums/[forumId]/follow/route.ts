import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ForumError, toggleForumFollow } from "@/lib/forums-server";

/**
 * POST /api/forums/:forumId/follow — follow/unfollow toggle (§4.13),
 * member-auth only. Following suppresses per-post forum_reply_mention
 * notifications in favor of the future digest (§4.10, Phase 6) — see
 * createForumPost.
 */
export async function POST(_request: Request, { params }: { params: { forumId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    const result = await toggleForumFollow(params.forumId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
