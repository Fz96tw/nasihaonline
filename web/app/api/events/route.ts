import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireTier } from "@/lib/auth";
import { EventError, createEvent, getPublicUpcomingEvents } from "@/lib/events-server";
import { EVENT_SUBMISSION_TIERS } from "@/lib/events";
import { createEventSchema } from "@/lib/validation/event";

// Public, unauthenticated route (§4.6) — not listed in middleware's
// isProtectedApiRoute, and getPublicUpcomingEvents() never selects
// meetingUrl/deidentificationConfirmed, so there's no gate to bypass here.
export async function GET() {
  const events = await getPublicUpcomingEvents();

  return NextResponse.json({ events }, { headers: { "cache-control": "no-store" } });
}

/**
 * POST /api/events — "Submit Event" (§4.6), gated to EVENT_SUBMISSION_TIERS.
 * Also not listed under middleware's isProtectedApiRoute (that list is
 * scoped to whole-path prefixes, and GET here must stay public), so
 * auth/tier gating is enforced in-route via requireTier(), same pattern as
 * the RSVP route's requireUser().
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireTier(EVENT_SUBMISSION_TIERS);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = createEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const event = await createEvent(user.id, parsed.data);
    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
