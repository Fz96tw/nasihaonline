import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireTier } from "@/lib/auth";
import { InboxAccessError, editInboxMessage, getThreadForUser } from "@/lib/inbox-server";
import { INBOX_TIERS } from "@/lib/members";
import { editMessageSchema } from "@/lib/validation/inbox";

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

/**
 * PATCH /api/inbox/messages/:id — editing a message the caller sent (thread
 * root or reply — :id here is a specific message's id, unlike GET's thread
 * root id), sender-only within a 15-minute window, enforced inside
 * editInboxMessage(). Gated to INBOX_TIERS, same as every other Inbox route.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireTier(INBOX_TIERS);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  const parsed = editMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await editInboxMessage(id, user.id, parsed.data.body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InboxAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
