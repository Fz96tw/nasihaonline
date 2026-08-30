import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getQuickRecordingProcessingStatus, QuickRecordingError } from "@/lib/quick-recordings-server";

/** GET /api/quick-recordings/:id/status — polled by the /meet/quick/[id]/done page while the egress_ended webhook hasn't attached the recording yet. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    const status = await getQuickRecordingProcessingStatus(id, user.id);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof QuickRecordingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
