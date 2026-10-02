import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getReminderEventsForUser } from "@/lib/events-server";
import { getReminderMeetingsForUser } from "@/lib/meeting-requests-server";

/**
 * GET /api/session-reminders — the current member's events/1-on-1 meetings
 * that are inside the "starting soon" window or in progress, for the floating
 * session reminder. Own sessions only; exposes a joinHref, never the raw
 * meeting URL or LiveKit room name.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser({ touch: false });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const [events, meetings] = await Promise.all([
    getReminderEventsForUser(user.id),
    getReminderMeetingsForUser(user.id),
  ]);
  const sessions = [...events, ...meetings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
}
