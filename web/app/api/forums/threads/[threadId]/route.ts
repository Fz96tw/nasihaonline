import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { deleteForumThread, ForumError, updateForumThread } from "@/lib/forums-server";
import { updateForumThreadSchema } from "@/lib/validation/forum";
import { enqueueForumThreadIndexSync } from "@/lib/queues/search-index-queue";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * PATCH /api/forums/threads/:threadId — editing a standalone thread's title
 * and/or audience, author or moderator/admin only, enforced inside
 * updateForumThread(). A thread linked to an Event/KnowledgeItem is rejected
 * there with a 400 — its title/visibility are managed automatically.
 */
export async function PATCH(request: Request, { params }: { params: { threadId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = updateForumThreadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const isPrivileged = user.role === Role.admin || user.role === Role.moderator;

  try {
    const result = await updateForumThread(params.threadId, user.id, isPrivileged, parsed.data);
    await enqueueForumThreadIndexSync(result.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/**
 * DELETE /api/forums/threads/:threadId — the thread's author or a
 * moderator/admin removing a standalone thread directly, enforced inside
 * deleteForumThread(). Re-syncs the search index afterward (removes the
 * doc, since the thread is now invisible to every viewer), same pattern as
 * DELETE /api/forums/posts/:postId.
 */
export async function DELETE(_request: Request, { params }: { params: { threadId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const isPrivileged = user.role === Role.admin || user.role === Role.moderator;

  try {
    const result = await deleteForumThread(params.threadId, user.id, isPrivileged);
    await enqueueForumThreadIndexSync(result.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
