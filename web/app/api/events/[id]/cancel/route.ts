import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, cancelEvent } from "@/lib/events-server";

/**
 * POST /api/events/:id/cancel — cancels an event (host or admin only,
 * enforced inside cancelEvent()), for any visibility. Notifies everyone who
 * committed to it (invitees, RSVP'd members, external registrants) — see
 * cancelEvent's own comment.
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
