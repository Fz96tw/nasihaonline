import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { NotificationAccessError, markNotificationRead } from "@/lib/notifications-server";

/** PATCH /api/notifications/:id — marks a notification read (§4.10 AC: opening a notification marks it read). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    const result = await markNotificationRead(id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NotificationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
