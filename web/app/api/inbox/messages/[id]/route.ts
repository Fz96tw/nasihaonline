import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireTier } from "@/lib/auth";
import { InboxAccessError, getThreadForUser } from "@/lib/inbox-server";
import { INBOX_TIERS } from "@/lib/members";

/**
 * GET /api/inbox/messages/:id — a thread's full message list for the detail
 * pane. As a side effect, marks the viewer's unread messages in this thread
 * as read (§4.7 AC2). Gated to INBOX_TIERS — Friend tier has no Inbox
 * access (§2.2).
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
    const thread = await getThreadForUser(id, user.id);
    return NextResponse.json(thread);
  } catch (error) {
    if (error instanceof InboxAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
