import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, deleteEventRecording } from "@/lib/events-server";

/**
 * DELETE /api/events/:id/recording?occurrence=ISO — host or admin only
 * (enforced inside deleteEventRecording). `occurrence` identifies which
 * session's recording, matching the same query param the detail page
 * already reads to resolve a recurring event's occurrence.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const occurrenceParam = new URL(request.url).searchParams.get("occurrence");
  const occurrenceDate = occurrenceParam ? new Date(occurrenceParam) : null;
  if (!occurrenceDate || Number.isNaN(occurrenceDate.getTime())) {
    return NextResponse.json({ error: "A valid occurrence date is required." }, { status: 400 });
  }

  try {
    await deleteEventRecording(id, occurrenceDate, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
