import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { MeetingRequestError, deleteMeetingRequestRecording } from "@/lib/meeting-requests-server";

/** DELETE /api/inbox/meeting-requests/:id/recording — sender/organizer only (enforced inside deleteMeetingRequestRecording). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    await deleteMeetingRequestRecording(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
