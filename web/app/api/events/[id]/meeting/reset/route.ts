import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, resetEventMeeting } from "@/lib/events-server";

/** POST /api/events/:id/meeting/reset — host-only (meeting-join-experience). Un-starts the meeting. */
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
    await resetEventMeeting(id, user);
    return NextResponse.json({ started: false });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
