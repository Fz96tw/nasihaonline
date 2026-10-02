import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getLiveEventsForMember } from "@/lib/events-server";

/**
 * GET /api/member-live-events — events the host has started that the current
 * member is allowed to see (community gating; restricted events only for
 * invitees and the host), for the signed-in live-events strip. Exposes only a
 * joinHref and the member's own RSVP state, never the raw meeting URL or
 * LiveKit room name. The signed-out counterpart is
 * /api/public-session-reminders.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const sessions = await getLiveEventsForMember(user);
  return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
}
