import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { AttendanceError, recordAttendeeAttendance } from "@/lib/attendance-server";

const recordAttendeeSchema = z.object({ userId: z.string().min(1) });

/**
 * POST /api/events/:id/attendance/attendees — records one invited member's
 * attendance on a restricted event and posts their confirmed Knowledge
 * Hours earn (Audience-Restricted Group Events, Objective 04). Distinct
 * from POST /api/events/:id/attendance (the host's own row, untouched).
 * Authorization beyond "is signed in" (host or admin, restricted events
 * only, past events only) lives in recordAttendeeAttendance().
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
  const parsed = recordAttendeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await recordAttendeeAttendance(id, parsed.data.userId, user);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AttendanceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
