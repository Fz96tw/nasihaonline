import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, resendEventNotifications } from "@/lib/events-server";

/**
 * POST /api/events/:id/resend-notifications — "Resend Notifications" (event
 * detail page), host or admin only (enforced inside resendEventNotifications,
 * community events only). Re-broadcasts the same member-wide bell + email
 * announcement createEvent sends automatically at creation time, and logs
 * the send to the event's EventNotificationBroadcast trail.
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

  try {
    const result = await resendEventNotifications(id, user);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
