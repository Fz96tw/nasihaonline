import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ForumError, deleteForumPost, updateForumPost } from "@/lib/forums-server";
import { updateForumPostSchema } from "@/lib/validation/forum";
import { enqueueForumThreadIndexSync } from "@/lib/queues/search-index-queue";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * PATCH /api/forums/posts/:postId — editing a post's body (opening post or
 * reply), author or moderator/admin only, enforced inside updateForumPost().
 */
export async function PATCH(request: Request, { params }: { params: { postId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = updateForumPostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const isPrivileged = user.role === Role.admin || user.role === Role.moderator;

  try {
    const result = await updateForumPost(params.postId, user.id, isPrivileged, parsed.data);
    await enqueueForumThreadIndexSync(result.threadId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/**
 * DELETE /api/forums/posts/:postId — the author or a moderator/admin
 * removing a post directly, enforced inside deleteForumPost(). Re-syncs the
 * thread's search doc afterward, same as PATCH above.
 */
export async function DELETE(_request: Request, { params }: { params: { postId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const isPrivileged = user.role === Role.admin || user.role === Role.moderator;

  try {
    const result = await deleteForumPost(params.postId, user.id, isPrivileged);
    await enqueueForumThreadIndexSync(result.threadId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
