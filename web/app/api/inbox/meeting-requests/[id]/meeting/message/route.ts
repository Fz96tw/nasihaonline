import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { MeetingRequestError, updateMeetingRequestMeetingMessage } from "@/lib/meeting-requests-server";

/** PATCH /api/inbox/meeting-requests/:id/meeting/message — sender-only (meeting-join-experience). Multipart, same shape as the Event equivalent. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const formData = await request.formData();

  const messageField = formData.get("message");
  const message = typeof messageField === "string" && messageField.trim().length > 0 ? messageField.trim() : null;

  const imageField = formData.get("image");
  const image = imageField instanceof File && imageField.size > 0 ? imageField : null;

  const removeImage = formData.get("removeImage") === "true";

  try {
    await updateMeetingRequestMeetingMessage(id, user.id, { message, image, removeImage });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
