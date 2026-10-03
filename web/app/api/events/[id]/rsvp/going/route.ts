import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, rsvpGoingToEvent } from "@/lib/events-server";

/**
 * POST /api/events/:id/rsvp/going — the member popup's explicit "RSVP"
 * button. Unlike POST /api/events/:id/rsvp (a toggle) this only ever moves the
 * member to `going`: an already-going member is a no-op with no second
 * calendar invite or notification, so a stale popup can't cancel an RSVP.
 * Auth is enforced here via requireUser(), same as the toggle route.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    const result = await rsvpGoingToEvent(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
