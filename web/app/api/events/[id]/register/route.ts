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

  await sendEventRegistrationConfirmationEmail(email, name, event);

  return NextResponse.json({ registered: true });
}
