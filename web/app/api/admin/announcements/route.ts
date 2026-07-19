import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { createAnnouncementSchema } from "@/lib/validation/announcement";
import { createAndSendAnnouncement } from "@/lib/announcements-server";
import { UploadValidationError } from "@/lib/storage";

/**
 * POST /api/admin/announcements — "Send Announcement" (§4.10), admin-only.
 * Multipart rather than JSON since the optional cover image travels
 * alongside title/body in one request, same as POST /api/blog. Composing
 * and sending are one step (no draft mode): this broadcasts immediately.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const parsed = createAnnouncementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    showInFeed: formData.get("showInFeed") === "true",
    notifyInApp: formData.get("notifyInApp") === "true",
    sendEmail: formData.get("sendEmail") === "true",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  try {
    const announcement = await createAndSendAnnouncement(user.id, { ...parsed.data, heroImage });
    return NextResponse.json({ id: announcement.id }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
