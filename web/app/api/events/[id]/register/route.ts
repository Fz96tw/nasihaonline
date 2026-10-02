import { NextResponse } from "next/server";
import { EventError, registerForEvent } from "@/lib/events-server";
import { eventRegistrationSchema } from "@/lib/validation/event-registration";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendEventRegistrationConfirmationEmail } from "@/lib/email";

/**
 * POST /api/events/:id/register — captures a non-member's email/name for
 * an `open` event (the "Register" CTA a signed-out visitor sees on the
 * public /events page). Deliberately public, unlike the member-gated
 * POST /api/events/:id/rsvp: no requireUser() here, just IP rate limiting
 * (same shape as /api/donations, since the caller has no session to key on).
 *
 * The registration id is the guest's join credential (`?rid=` on
 * /meet/event/:id), so it's returned to the browser ONLY for a first-time
 * registration of that email. A repeat submission (the email is already
 * registered) just gets the confirmation email re-sent to that address with
 * `alreadyRegistered: true` and no id — someone typing another person's
 * email can't use it to join as them, and can't rename their registration.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { success } = await rateLimit(`event-register:${clientIp(request)}`, {
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const parsed = eventRegistrationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const { name, email } = parsed.data;

  let event;
  try {
    event = await registerForEvent(id, { email, name });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  // Emailed in both cases, addressed to the stored name (not whatever a
  // repeat submitter typed) and carrying the guest's own join link.
  await sendEventRegistrationConfirmationEmail(email, event.name, event);

  if (!event.created) {
    return NextResponse.json({ registered: true, alreadyRegistered: true });
  }

  const hasMeeting = Boolean(event.meetingUrl || event.livekitRoomName);
  return NextResponse.json({
    registered: true,
    alreadyRegistered: false,
    registrationId: event.registrationId,
    // Only when the event actually has a meeting to land in.
    joinPath: hasMeeting ? `/meet/event/${event.id}?rid=${encodeURIComponent(event.registrationId)}` : null,
  });
}
