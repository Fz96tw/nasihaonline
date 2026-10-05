import { NextResponse } from "next/server";
import { z } from "zod";
import { EventError } from "@/lib/events-server";
import { joinViaGuestLink } from "@/lib/event-guest-invites-server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1, "Name is required").max(120),
  // Required for every plain-link guest, on every platform.
  email: z.string().trim().email("Enter a valid email address").max(254),
});

/**
 * POST /api/events/:id/guest-join — a signed-out visitor opened the event's
 * private guest link and gave a name + email. Deliberately public (IP rate
 * limited, same shape as /register): the secret token in the body is the
 * only credential, and it's checked inside joinViaGuestLink.
 *
 * Like /register, the registration id (the join credential) is returned
 * only for a first-time registration of that email; a repeat gets the join
 * link emailed instead, so typing someone else's address can't hand over
 * their registration.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { success } = await rateLimit(`event-guest-join:${clientIp(request)}`, {
    limit: 15,
    windowSeconds: 60 * 60,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const { token, name, email } = parsed.data;
  try {
    const result = await joinViaGuestLink(id, token, { name, email });
    return NextResponse.json({
      registrationId: result.registrationId,
      alreadyRegistered: !result.created,
      joinPath: result.registrationId ? `/meet/event/${id}?rid=${encodeURIComponent(result.registrationId)}` : null,
    });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
