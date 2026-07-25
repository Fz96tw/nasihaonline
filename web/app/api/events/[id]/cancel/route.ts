import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, cancelEvent } from "@/lib/events-server";

/**
 * POST /api/events/:id/cancel — cancels an event (host or admin only,
 * enforced inside cancelEvent()). For a restricted event this notifies
 * every current invitee; the UI only exposes this action for restricted
 * events (see components/calendar/manage-invitees.tsx), but the endpoint
 * itself doesn't restrict by visibility — see cancelEvent's own comment.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    await cancelEvent(id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
