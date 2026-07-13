import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventRsvpError, rsvpToEvent } from "@/lib/events-server";

/**
 * POST /api/events/:id/rsvp — toggles the current member's RSVP for an
 * event (§4.6). Not listed under middleware's isProtectedApiRoute (that
 * list is scoped to whole-path prefixes like /api/profile, /api/members —
 * /api/events itself stays public for GET), so auth is enforced here via
 * requireUser() instead, same pattern as the dynamic notification routes.
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
    const result = await rsvpToEvent(user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EventRsvpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
