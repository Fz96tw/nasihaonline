import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { clearReadNotifications } from "@/lib/notifications-server";

/** DELETE /api/notifications/clear-read — "clear read" prune for the current user's Notification feed. */
export async function DELETE() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  await clearReadNotifications(user.id);
  return NextResponse.json({ ok: true });
}
