import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ForumError, recordThreadView } from "@/lib/forums-server";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * POST /api/forums/threads/:threadId/view — records a unique visit for the
 * eye-icon count (§4.13), member-auth only (forums have no signed-out
 * reader, unlike the blog's public POST /api/blog/:slug/view).
 */
export async function POST(_request: Request, { params }: { params: { threadId: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const isPrivileged = user.role === Role.admin || user.role === Role.moderator;

  try {
    const views = await recordThreadView(params.threadId, user.id, isPrivileged);
    return NextResponse.json({ views });
  } catch (error) {
    if (error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
