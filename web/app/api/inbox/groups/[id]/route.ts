import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireTier } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { GroupMessageError, getGroupMessageThread } from "@/lib/inbox-groups-server";
import { INBOX_TIERS } from "@/lib/members";

/**
 * GET /api/inbox/groups/:id — a group message's detail pane (§4.7),
 * participants only. Side effect: marks the group read for the viewer.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireTier(INBOX_TIERS);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    const thread = await getGroupMessageThread(id, user.id, user.role === Role.admin);
    return NextResponse.json(thread);
  } catch (error) {
    if (error instanceof GroupMessageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
