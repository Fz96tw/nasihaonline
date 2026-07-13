import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { markAllNotificationsRead } from "@/lib/notifications-server";

/** POST /api/notifications/read-all — "mark all read" for the current user's Notification feed. */
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  await markAllNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
}
