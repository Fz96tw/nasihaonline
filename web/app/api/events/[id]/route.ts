import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, updateEvent } from "@/lib/events-server";
import { updateEventSchema } from "@/lib/validation/event";

/**
 * PATCH /api/events/:id — editing an event (§4.6), host or admin only
 * (enforced in updateEvent, not here — any signed-in member can reach this
 * far, same requireUser()-then-domain-check pattern as PATCH /api/blog/[slug]).
 * Multipart rather than JSON — same rationale as POST /api/events — since
 * an optional replacement hero image travels alongside the other fields.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const parsed = updateEventSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || null,
    type: formData.get("type"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") || null,
    open: formData.get("open") === "true",
    icon: formData.get("icon") || null,
    meetingUrl: formData.get("meetingUrl") || null,
    deidentificationConfirmed: formData.get("deidentificationConfirmed") === "true",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  try {
    const event = await updateEvent(params.id, user, { ...parsed.data, heroImage });
    return NextResponse.json({ id: event.id });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
