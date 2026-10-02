import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, ensureGoingRsvp } from "@/lib/events-server";

/**
 * POST /api/events/:id/join — the live-events strip's "Join now" for a
 * signed-in member: silently ensures a `going` RSVP (idempotent — never
 * toggles an existing one off, sends no calendar email, notifies no one; see
 * ensureGoingRsvp) and returns the meeting path to navigate to. Not under
 * middleware's isProtectedApiRoute prefixes, so auth is enforced here via
 * requireUser(), same as POST /api/events/:id/rsvp.
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
    await ensureGoingRsvp(user, id);
    return NextResponse.json({ joinPath: `/meet/event/${id}` });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
