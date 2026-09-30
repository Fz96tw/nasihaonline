import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, messageEventAttendees } from "@/lib/events-server";
import { rateLimit } from "@/lib/rate-limit";

const messageAttendeesSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required.").max(200),
  body: z.string().trim().min(1, "Message is required.").max(5000),
});

/**
 * POST /api/events/:id/message-attendees — "Message attendees" (event detail
 * page), host or admin only (enforced inside messageEventAttendees). Emails
 * the host's own subject/body to going-RSVP'd members and registered guests.
 * CSRF is enforced by middleware; rate-limited per sender since each call
 * fans out one email per recipient.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { success } = await rateLimit(`event-message-attendees:${user.id}`, {
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many messages. Please try again later." }, { status: 429 });
  }

  const parsed = messageAttendeesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const { id } = await params;
  try {
    return NextResponse.json(await messageEventAttendees(id, user, parsed.data));
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
