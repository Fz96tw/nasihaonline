import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, deleteEventDraft, publishEventDraft, saveEventDraft, updateEvent } from "@/lib/events-server";
import { createEventSchema, draftEventSchema, updateEventSchema } from "@/lib/validation/event";
import { enqueueEventIndexSync } from "@/lib/queues/search-index-queue";

/**
 * PATCH /api/events/:id — editing an event (§4.6), host or admin only
 * (enforced in each of updateEvent/saveEventDraft/publishEventDraft, not
 * here — any signed-in member can reach this far, same
 * requireUser()-then-domain-check pattern as PATCH /api/blog/[slug]).
 * Multipart rather than JSON — same rationale as POST /api/events — since
 * an optional replacement hero image travels alongside the other fields.
 *
 * Save as Draft initiative — `action` picks one of three paths: "draft"
 * (saveEventDraft — stays a draft, relaxed validation), "publish"
 * (publishEventDraft — a draft's real first publish, full validation +
 * meeting provisioning/notifications), or anything else/absent (today's
 * unchanged updateEvent path, editing an already-published event).
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
  const rawAction = formData.get("action");
  const action = rawAction === "draft" ? "draft" : rawAction === "publish" ? "publish" : "save";

  // Same JSON-encoded-field pattern as POST /api/events — absent/malformed
  // means "does not repeat".
  let recurrence: unknown = null;
  const recurrenceRaw = formData.get("recurrence");
  if (typeof recurrenceRaw === "string" && recurrenceRaw.length > 0) {
    try {
      recurrence = JSON.parse(recurrenceRaw);
    } catch {
      recurrence = null;
    }
  }

  // Only meaningful for "draft"/"publish" (saveEventDraft/publishEventDraft
  // both take these; updateEventSchema below simply has no such fields, so
  // they're harmlessly dropped from its parsed output for a "save").
  let invitedUserIds: unknown = [];
  const invitedUserIdsRaw = formData.get("invitedUserIds");
  if (typeof invitedUserIdsRaw === "string" && invitedUserIdsRaw.length > 0) {
    try {
      invitedUserIds = JSON.parse(invitedUserIdsRaw);
    } catch {
      invitedUserIds = [];
    }
  }
  let coHostUserIds: unknown = [];
  const coHostUserIdsRaw = formData.get("coHostUserIds");
  if (typeof coHostUserIdsRaw === "string" && coHostUserIdsRaw.length > 0) {
    try {
      coHostUserIds = JSON.parse(coHostUserIdsRaw);
    } catch {
      coHostUserIds = [];
    }
  }

  const schema = action === "draft" ? draftEventSchema : action === "publish" ? createEventSchema : updateEventSchema;
  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || null,
    type: formData.get("type"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt") || null,
    open: formData.get("open") === "true",
    meetingUrl: formData.get("meetingUrl") || null,
    meetLinkSource: formData.get("meetLinkSource") || "manual",
    deidentificationConfirmed: formData.get("deidentificationConfirmed") === "true",
    timezone: formData.get("timezone") || null,
    visibility: formData.get("visibility") || "community",
    invitedUserIds,
    coHostUserIds,
    communityIds: formData.getAll("communityIds"),
    categoryIds: formData.getAll("categoryIds"),
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
    const input = { ...parsed.data, heroImage, meetingOrganizerMessage, meetingOrganizerMessageImage };
    // `schema` (and so `parsed.data`/`input`) is one of three shapes picked
    // at runtime by `action` — TS can't correlate that with which branch
    // below actually runs, but draftEventSchema/createEventSchema (the
    // "draft"/"publish" branches) are always the schema in play whenever
    // saveEventDraft/publishEventDraft are the ones being called, so both
    // casts are sound.
    const event =
      action === "draft"
        ? await saveEventDraft(params.id, user, input as unknown as Parameters<typeof saveEventDraft>[2])
        : action === "publish"
          ? await publishEventDraft(params.id, user, input as unknown as Parameters<typeof publishEventDraft>[2])
          : await updateEvent(params.id, user, input);
    // Only meaningful once actually published — saveEventDraft never makes
    // the event indexable (syncEventToIndex's own eligibility gate would
    // just delete-if-exists anyway, but skip the queue write entirely).
    if (action !== "draft") await enqueueEventIndexSync(event.id);
    return NextResponse.json({ id: event.id });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/**
 * DELETE /api/events/:id — "Discard Draft" (Save as Draft initiative).
 * Host or admin only, and only while the event is still a draft (enforced
 * in deleteEventDraft) — a published event is cancelled (see
 * POST /api/events/:id/cancel), never hard-deleted.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    await deleteEventDraft(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
