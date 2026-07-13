import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { MeetingRequestError, resolveMeetingRequest } from "@/lib/meeting-requests-server";
import { meetingRequestActionSchema } from "@/lib/validation/meeting-request";

/**
 * PATCH /api/inbox/meeting-requests/:id — the recipient's response (§4.7):
 * accept, decline, or propose a new time. Accepting auto-posts the ledger
 * spend transaction (§4.4) — see resolveMeetingRequest().
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  const parsed = meetingRequestActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const meetingRequest = await resolveMeetingRequest(id, user.id, parsed.data);
    return NextResponse.json({ id: meetingRequest.id, status: meetingRequest.status });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
