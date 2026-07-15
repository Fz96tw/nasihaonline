import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ForumError, createForumThread } from "@/lib/forums-server";
import { createForumThreadSchema } from "@/lib/validation/forum";
import { enqueueForumThreadIndexSync } from "@/lib/queues/search-index-queue";

/**
 * POST /api/forums/:forumId/threads — "New Thread" (§4.13), member-auth
 * only. JSON rather than multipart (no file upload, unlike POST /api/blog),
 * same shape as POST /api/events.
 */
export async function POST(request: Request, { params }: { params: { forumId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = createForumThreadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const thread = await createForumThread(params.forumId, user.id, parsed.data);
    await enqueueForumThreadIndexSync(thread.id);
    return NextResponse.json({ id: thread.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
