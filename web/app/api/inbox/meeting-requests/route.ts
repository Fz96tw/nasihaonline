import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { MeetingRequestError, createMeetingRequest } from "@/lib/meeting-requests-server";
import { createMeetingRequestSchema } from "@/lib/validation/meeting-request";

/**
 * POST /api/inbox/meeting-requests — "Request Meeting" on a Directory card
 * (§4.7): proposed topic + one or more proposed times, delivered to the
 * recipient's inbox as a distinct actionable item.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = createMeetingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const meetingRequest = await createMeetingRequest(user.id, parsed.data);
    return NextResponse.json({ id: meetingRequest.id }, { status: 201 });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
