import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { retractAnnouncement, AnnouncementError } from "@/lib/announcements-server";

/**
 * POST /api/admin/announcements/:id/retract — admin-only. Hides the
 * Announcement from the member feed/detail page and deletes its
 * Notification rows; the already-sent email can't be un-sent, and the
 * Announcement row itself stays (retracted) for the admin history list.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    await retractAnnouncement(params.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AnnouncementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
