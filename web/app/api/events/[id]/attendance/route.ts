import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { AttendanceError, recordHostAttendance } from "@/lib/attendance-server";

/**
 * POST /api/events/:id/attendance — records the event's host as attended
 * (§4.6) and auto-posts the confirmed Knowledge Hours earn transaction it
 * triggers (§4.4). Not listed under middleware's isProtectedApiRoute (that
 * list is scoped to whole-path prefixes; /api/events itself stays public for
 * GET), so auth is enforced here via requireUser(), same pattern as the RSVP
 * route. Authorization beyond "is signed in" (host or admin) lives in
 * recordHostAttendance().
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
    const result = await recordHostAttendance(id, user);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AttendanceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
