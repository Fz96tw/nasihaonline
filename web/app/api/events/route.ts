import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireTier } from "@/lib/auth";
import { EventError, createEvent, getPublicUpcomingEvents } from "@/lib/events-server";
import { EVENT_SUBMISSION_TIERS } from "@/lib/events";
import { createEventSchema } from "@/lib/validation/event";
import { enqueueEventIndexSync } from "@/lib/queues/search-index-queue";

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
 * the RSVP route's requireUser(). Multipart rather than JSON — same
 * rationale as POST /api/blog — since the optional hero image travels
 * alongside the other fields as one request.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireTier(EVENT_SUBMISSION_TIERS);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  // invitedUserIds travels as a JSON-encoded array within the same
  // multipart body as everything else — falls back to [] for a malformed
  // value rather than erroring, same "invalid input, not invalid request"
  // handling as every other field here (the schema itself rejects an empty
  // list for a restricted event).
  let invitedUserIds: unknown = [];
  const invitedUserIdsRaw = formData.get("invitedUserIds");
  if (typeof invitedUserIdsRaw === "string" && invitedUserIdsRaw.length > 0) {
    try {
      invitedUserIds = JSON.parse(invitedUserIdsRaw);
    } catch {
      invitedUserIds = [];
    }
  }

  // Repeat schedule (§4.6 recurring events) — same JSON-encoded-field
  // pattern as invitedUserIds above; absent/malformed means "does not
  // repeat" rather than a hard error, since createEventSchema's
  // requireRecurrenceInvariants only fires when recurrence is non-null.
  let recurrence: unknown = null;
  const recurrenceRaw = formData.get("recurrence");
  if (typeof recurrenceRaw === "string" && recurrenceRaw.length > 0) {
    try {
      recurrence = JSON.parse(recurrenceRaw);
    } catch {
      recurrence = null;
    }
  }

  const parsed = createEventSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || null,
    type: formData.get("type"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") || null,
    open: formData.get("open") === "true",
    meetingUrl: formData.get("meetingUrl") || null,
    deidentificationConfirmed: formData.get("deidentificationConfirmed") === "true",
    timezone: formData.get("timezone") || null,
    visibility: formData.get("visibility") || "community",
    invitedUserIds,
    meetLinkSource: formData.get("meetLinkSource") || "manual",
    recurrence,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  const messageField = formData.get("meetingOrganizerMessage");
  const meetingOrganizerMessage =
    typeof messageField === "string" && messageField.trim().length > 0 ? messageField.trim() : null;
  const messageImageField = formData.get("meetingOrganizerMessageImage");
  const meetingOrganizerMessageImage =
    messageImageField instanceof File && messageImageField.size > 0 ? messageImageField : null;

  try {
    const event = await createEvent(user.id, {
      ...parsed.data,
      heroImage,
      meetingOrganizerMessage,
      meetingOrganizerMessageImage,
    });
    await enqueueEventIndexSync(event.id);
    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
