import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getNotificationsForUser } from "@/lib/notifications-server";

/** GET /api/notifications — the current user's recent Notification feed + unread count (§4.10), polled by the nav bell. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const result = await getNotificationsForUser(user.id);
  return NextResponse.json(result);
}
