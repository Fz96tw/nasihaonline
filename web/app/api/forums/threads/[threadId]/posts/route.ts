import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ForumError, createForumPost } from "@/lib/forums-server";
import { createForumPostSchema } from "@/lib/validation/forum";
import { enqueueForumThreadIndexSync } from "@/lib/queues/search-index-queue";

/**
 * POST /api/forums/threads/:threadId/posts — post/reply on a thread
 * (§4.13), member-auth only. Notifies the thread's other participants
 * (see createForumPost) except followers, who wait for the future digest.
 */
export async function POST(request: Request, { params }: { params: { threadId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = createForumPostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const post = await createForumPost(params.threadId, user.id, parsed.data);
    await enqueueForumThreadIndexSync(params.threadId);
    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
