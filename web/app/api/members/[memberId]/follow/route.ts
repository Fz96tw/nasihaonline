import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { MemberFollowError, setMemberFollow } from "@/lib/member-follows-server";

async function handle(following: boolean, memberId: string) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    await setMemberFollow(user.id, memberId, following);
    return NextResponse.json({ following });
  } catch (error) {
    if (error instanceof MemberFollowError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** PUT /api/members/:memberId/follow — save a member to the viewer's private "My people". */
export async function PUT(_request: Request, { params }: { params: { memberId: string } }) {
  return handle(true, params.memberId);
}

/** DELETE /api/members/:memberId/follow — remove a member from "My people". */
export async function DELETE(_request: Request, { params }: { params: { memberId: string } }) {
  return handle(false, params.memberId);
}
