import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { createAnnouncementSchema } from "@/lib/validation/announcement";
import { AnnouncementError, discardAnnouncementDraft, updateAnnouncementDraft } from "@/lib/announcements-server";

/**
 * PATCH /api/admin/announcements/:id — admin-only. Edits an unsent draft's
 * title/body/channels. A sent Announcement's content can't change (only be
 * retracted), so a non-draft id gets a 409.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = createAnnouncementSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await updateAnnouncementDraft(params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AnnouncementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** DELETE /api/admin/announcements/:id — admin-only. Discards an unsent draft outright (nothing was ever sent, so there's no record to keep). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    await discardAnnouncementDraft(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AnnouncementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
