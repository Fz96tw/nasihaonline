import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { AttendanceError, recordHostAttendance } from "@/lib/attendance-server";

const recordHostAttendanceSchema = z.object({ occurrenceDate: z.string().min(1) });

/**
 * POST /api/events/:id/attendance — records the event's host as attended
 * (§4.6) and auto-posts the confirmed Knowledge Hours earn transaction it
 * triggers (§4.4). Not listed under middleware's isProtectedApiRoute (that
 * list is scoped to whole-path prefixes; /api/events itself stays public for
 * GET), so auth is enforced here via requireUser(), same pattern as the RSVP
 * route. Authorization beyond "is signed in" (host or admin) lives in
 * recordHostAttendance(). occurrenceDate is the specific past session being
 * recorded — for a non-recurring event the caller passes the event's own
 * startsAt, keeping the contract uniform (§4.6 recurring events).
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
  const body = await request.json().catch(() => null);
  const parsed = recordHostAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const occurrenceDate = new Date(parsed.data.occurrenceDate);
  if (Number.isNaN(occurrenceDate.getTime())) {
    return NextResponse.json({ error: "occurrenceDate isn't a valid date." }, { status: 400 });
  }

  try {
    const result = await recordHostAttendance(id, occurrenceDate, user);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AttendanceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
