import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getFollowedMemberIds } from "@/lib/member-follows-server";

/** GET /api/me/follows — the viewer's own "My people" ids. Never accepts a user id: the list is private. */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ ids: await getFollowedMemberIds(user.id) });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
}
