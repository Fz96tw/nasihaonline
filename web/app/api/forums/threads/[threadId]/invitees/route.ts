import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ForumError, updateForumThreadInvitees } from "@/lib/forums-server";
import { updateForumThreadInviteesSchema } from "@/lib/validation/forum";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * PATCH /api/forums/threads/:threadId/invitees — adds and/or removes
 * members from a restricted standalone thread's invited list after
 * creation (Member-Initiated Restricted Forum Threads, §4.13/§11.16).
 * Thread author or moderator/admin only — except an Inbox group message
 * (§4.7), where any participant may add and only the author or an admin may
 * remove. Enforced inside updateForumThreadInvitees() — this route only
 * checks the caller is signed in.
 */
export async function PATCH(request: Request, { params }: { params: { threadId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = updateForumThreadInviteesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const isPrivileged = user.role === Role.admin || user.role === Role.moderator;

  try {
    const result = await updateForumThreadInvitees(
      params.threadId,
      user.id,
      isPrivileged,
      parsed.data,
      user.role === Role.admin,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
