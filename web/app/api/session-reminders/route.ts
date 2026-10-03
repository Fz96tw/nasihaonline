import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getReminderEventsForUser, getUpcomingEventsForMember } from "@/lib/events-server";
import { getReminderMeetingsForUser } from "@/lib/meeting-requests-server";

/**
 * GET /api/session-reminders — the current member's events/1-on-1 meetings
 * that are inside the "starting soon" window or in progress, for the floating
 * session reminder: events they host or RSVP'd "going" to, their 1-on-1
 * meetings, and (rsvped: false) visible events they haven't RSVP'd to, so
 * they hear about a public event before it starts. The two event lists never
 * overlap (the second excludes hosted / going events). Exposes a joinHref,
 * never the raw meeting URL or LiveKit room name.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const [events, meetings, upcoming] = await Promise.all([
    getReminderEventsForUser(user.id),
    getReminderMeetingsForUser(user.id),
    getUpcomingEventsForMember(user),
  ]);
  const sessions = [...events, ...meetings, ...upcoming].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
}
