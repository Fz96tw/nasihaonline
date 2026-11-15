import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireTier } from "@/lib/auth";
import { GroupMessageError, leaveGroupMessage } from "@/lib/inbox-groups-server";
import { INBOX_TIERS } from "@/lib/members";

/** POST /api/inbox/groups/:id/leave — an invitee leaves a group message (§4.7). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireTier(INBOX_TIERS);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    await leaveGroupMessage(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GroupMessageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
