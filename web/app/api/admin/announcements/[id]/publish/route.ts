import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { AnnouncementError, publishAnnouncementDraft } from "@/lib/announcements-server";
import { enqueueAnnouncementIndexSync } from "@/lib/queues/search-index-queue";

/**
 * POST /api/admin/announcements/:id/publish — admin-only "Approve & publish"
 * for a draft: stamps sentAt and fans out per the draft's channels. Safe to
 * call twice — the second call gets a 409 and sends nothing.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    await publishAnnouncementDraft(params.id);
    await enqueueAnnouncementIndexSync(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AnnouncementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
