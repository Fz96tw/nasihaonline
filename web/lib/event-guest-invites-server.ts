import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { EventVisibility, EventRegistrationSource, Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { buildEventIcs, EventError } from "@/lib/events-server";
import { sendEventGuestInviteEmail, sendEventRegistrationConfirmationEmail } from "@/lib/email";

/**
 * Private guest-invite link + invite-by-email for `open` events.
 *
 * Everything an anonymous guest does after getting in still keys on an
 * EventRegistration id (`?rid=`), re-validated by getEventMeetingStatus on
 * every status/token/chat call — this module only decides how a
 * registration comes to exist (host-typed invite, or the event's private
 * link) and lets the host revoke one. It never adds a second way to be
 * authorised in the meeting itself.
 */

/** Hard caps — invites go to strangers from the shared mail.nasihaforyou.org sending domain. */
export const MAX_INVITES_PER_REQUEST = 20;
export const MAX_INVITES_PER_EVENT = 50;
export const MAX_INVITES_PER_HOST_PER_DAY = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

const emailSchema = z.string().trim().email().max(254);

export interface GuestInviteRow {
  id: string;
  email: string;
  name: string | null;
  source: "invited" | "link";
  /** When the invite was last (re)sent — null for a link guest. */
  invitedAt: string | null;
  joined: boolean;
  revoked: boolean;
}

export interface GuestLinkState {
  /** Null when the feature is off for this event. */
  token: string | null;
  guests: GuestInviteRow[];
}

const eventSelect = {
  id: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  open: true,
  visibility: true,
  hostId: true,
  cancelledAt: true,
  publishedAt: true,
  meetingUrl: true,
  livekitRoomName: true,
  guestLinkToken: true,
  recurrence: { select: { id: true } },
} as const;

type GuestEvent = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

function loadEvent(eventId: string) {
  return db.event.findUnique({ where: { id: eventId }, select: eventSelect });
}

/** Whether this event may offer guest links/invites at all — open, public-visibility, published, live. */
function assertGuestFeatureAllowed(event: GuestEvent | null): asserts event is GuestEvent {
  if (!event) throw new EventError(404, "Event not found.");
  if (event.cancelledAt) throw new EventError(400, "This event has been cancelled.");
  if (!event.open || event.visibility === EventVisibility.invited) {
    throw new EventError(400, "Guest links are only available for public events.");
  }
  if (!event.publishedAt) throw new EventError(400, "Publish this event before inviting guests.");
  // A recurring event's startsAt is only its anchor, so only a one-off can be "over".
  if (!event.recurrence && (event.endsAt ?? event.startsAt).getTime() < Date.now()) {
    throw new EventError(400, "This event has already taken place.");
  }
}

async function loadManageable(eventId: string, actingUser: UserModel): Promise<GuestEvent> {
  const event = await loadEvent(eventId);
  if (!event) throw new EventError(404, "Event not found.");
  if (actingUser.role !== Role.admin && event.hostId !== actingUser.id) {
    throw new EventError(403, "Only the event's host or an admin can manage guest invitations.");
  }
  assertGuestFeatureAllowed(event);
  return event;
}

function newToken() {
  return randomBytes(24).toString("base64url");
}

function rowOf(registration: {
  id: string;
  email: string;
  name: string | null;
  source: EventRegistrationSource;
  invitedAt: Date | null;
  joinedAt: Date | null;
  revokedAt: Date | null;
}): GuestInviteRow {
  return {
    id: registration.id,
    email: registration.email,
    name: registration.name,
    source: registration.source === EventRegistrationSource.link ? "link" : "invited",
    invitedAt: registration.invitedAt?.toISOString() ?? null,
    joined: registration.joinedAt !== null,
    revoked: registration.revokedAt !== null,
  };
}

/** Host/admin view: the current link token (if enabled) and every invited/link guest. */
export async function getGuestLinkState(eventId: string, actingUser: UserModel): Promise<GuestLinkState> {
  const event = await loadEvent(eventId);
  if (!event) throw new EventError(404, "Event not found.");
  if (actingUser.role !== Role.admin && event.hostId !== actingUser.id) {
    throw new EventError(403, "Only the event's host or an admin can manage guest invitations.");
  }
  const guests = await db.eventRegistration.findMany({
    where: { eventId, source: { in: [EventRegistrationSource.invited, EventRegistrationSource.link] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, source: true, invitedAt: true, joinedAt: true, revokedAt: true },
  });
  return { token: event.guestLinkToken, guests: guests.map(rowOf) };
}

/**
 * Turns the private link on (first call), or rotates it. Rotating revokes
 * every guest the old link admitted — a leaked link is the reason to rotate,
 * and a guest holding a `rid` from it would otherwise stay in forever.
 * Guests the host invited by email are unaffected (their address is known).
 */
export async function enableGuestLink(
  eventId: string,
  actingUser: UserModel,
  { regenerate }: { regenerate: boolean },
): Promise<{ token: string }> {
  const event = await loadManageable(eventId, actingUser);
  if (event.guestLinkToken && !regenerate) return { token: event.guestLinkToken };

  const token = newToken();
  await db.$transaction([
    db.event.update({ where: { id: eventId }, data: { guestLinkToken: token } }),
    db.eventRegistration.updateMany({
      where: { eventId, source: EventRegistrationSource.link, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return { token };
}

/** Turns the feature off: the link stops working and link guests are revoked. */
export async function disableGuestLink(eventId: string, actingUser: UserModel): Promise<void> {
  const event = await loadEvent(eventId);
  if (!event) throw new EventError(404, "Event not found.");
  if (actingUser.role !== Role.admin && event.hostId !== actingUser.id) {
    throw new EventError(403, "Only the event's host or an admin can manage guest invitations.");
  }
  await db.$transaction([
    db.event.update({ where: { id: eventId }, data: { guestLinkToken: null } }),
    db.eventRegistration.updateMany({
      where: { eventId, source: EventRegistrationSource.link, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export type GuestInviteOutcome =
  | { email: string; status: "sent" }
  | { email: string; status: "invalid" | "duplicate" | "already_registered" | "revoked_guest" | "failed" | "limit"; message: string };

function buildIcsFor(event: GuestEvent) {
  return {
    icsContent: buildEventIcs({
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      meetingUrl: event.meetingUrl,
      livekitRoomName: event.livekitRoomName,
    }),
    icsFilename: `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics`,
  };
}

async function deliverInvite(
  event: GuestEvent,
  host: { name: string | null; email: string },
  registration: { id: string; email: string },
  note: string | null,
) {
  return sendEventGuestInviteEmail({
    to: registration.email,
    hostName: host.name ?? "A NASIHA member",
    hostEmail: host.email,
    note,
    event: {
      id: event.id,
      registrationId: registration.id,
      title: event.title,
      startsAt: event.startsAt,
      timezone: event.timezone,
      meetingUrl: event.meetingUrl,
      livekitRoomName: event.livekitRoomName,
      ...buildIcsFor(event),
    },
  });
}

/**
 * Invites non-members by email: one `invited` EventRegistration per address
 * (so the guest has a real join credential and an email on file), then the
 * invitation itself, host BCC'd and reply-to'd. Limits are counted from the
 * database rather than a counter so a resend or a revoke can't drift them.
 * Per-address outcomes are returned instead of failing the whole batch —
 * one typo shouldn't block the other nineteen invitations.
 */
export async function inviteGuestsByEmail(
  eventId: string,
  actingUser: UserModel,
  input: { emails: string[]; note?: string | null },
): Promise<GuestInviteOutcome[]> {
  const event = await loadManageable(eventId, actingUser);
  if (!event.guestLinkToken) {
    throw new EventError(400, "Turn on guest links for this event before inviting guests.");
  }
  if (input.emails.length === 0) throw new EventError(400, "Enter at least one email address.");
  if (input.emails.length > MAX_INVITES_PER_REQUEST) {
    throw new EventError(400, `You can invite up to ${MAX_INVITES_PER_REQUEST} people at a time.`);
  }

  const host = await db.user.findUnique({ where: { id: event.hostId }, select: { name: true, email: true } });
  if (!host) throw new EventError(404, "Event not found.");
  const note = input.note?.trim() ? input.note.trim().slice(0, 1000) : null;

  const [perEvent, perHostToday] = await Promise.all([
    db.eventRegistration.count({ where: { eventId, source: EventRegistrationSource.invited } }),
    db.eventRegistration.count({
      where: { invitedById: actingUser.id, invitedAt: { gte: new Date(Date.now() - DAY_MS) } },
    }),
  ]);
  let eventBudget = MAX_INVITES_PER_EVENT - perEvent;
  let dailyBudget = MAX_INVITES_PER_HOST_PER_DAY - perHostToday;

  const outcomes: GuestInviteOutcome[] = [];
  const seen = new Set<string>();

  for (const raw of input.emails) {
    const parsed = emailSchema.safeParse(raw);
    if (!parsed.success) {
      outcomes.push({ email: raw.trim(), status: "invalid", message: "Not a valid email address." });
      continue;
    }
    const email = parsed.data.toLowerCase();
    if (seen.has(email)) {
      outcomes.push({ email, status: "duplicate", message: "Listed more than once." });
      continue;
    }
    seen.add(email);

    const existing = await db.eventRegistration.findFirst({
      where: { eventId, email: { equals: email, mode: "insensitive" } },
      select: { id: true, source: true, revokedAt: true },
    });
    if (existing && existing.source !== EventRegistrationSource.invited) {
      outcomes.push({
        email,
        status: existing.revokedAt ? "revoked_guest" : "already_registered",
        message: existing.revokedAt
          ? "This person was removed from the event earlier."
          : "Already registered for this event.",
      });
      continue;
    }

    // Re-inviting an address that's already in the list is a resend, which
    // doesn't add a row — only a brand-new address spends event budget.
    if (!existing && eventBudget <= 0) {
      outcomes.push({ email, status: "limit", message: `This event is limited to ${MAX_INVITES_PER_EVENT} invitations.` });
      continue;
    }
    if (dailyBudget <= 0) {
      outcomes.push({ email, status: "limit", message: "Daily invitation limit reached. Try again tomorrow." });
      continue;
    }

    let registration: { id: string; email: string };
    try {
      registration = existing
        ? await db.eventRegistration.update({
            where: { id: existing.id },
            // Re-inviting a revoked invite brings them back.
            data: { invitedAt: new Date(), invitedById: actingUser.id, revokedAt: null },
            select: { id: true, email: true },
          })
        : await db.eventRegistration.create({
            data: {
              eventId,
              email,
              source: EventRegistrationSource.invited,
              invitedAt: new Date(),
              invitedById: actingUser.id,
            },
            select: { id: true, email: true },
          });
    } catch (error) {
      // A concurrent request registered this address first.
      if ((error as { code?: string }).code === "P2002") {
        outcomes.push({ email, status: "already_registered", message: "Already registered for this event." });
        continue;
      }
      throw error;
    }
    if (!existing) eventBudget -= 1;
    dailyBudget -= 1;

    const result = await deliverInvite(event, host, registration, note);
    outcomes.push(
      result.ok
        ? { email, status: "sent" }
        : { email, status: "failed", message: "The email couldn't be sent. Try resending it." },
    );
  }
  return outcomes;
}

async function loadGuest(eventId: string, registrationId: string) {
  const registration = await db.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, eventId: true, email: true, source: true, revokedAt: true },
  });
  if (!registration || registration.eventId !== eventId || registration.source === EventRegistrationSource.public) {
    throw new EventError(404, "Guest not found.");
  }
  return registration;
}

/** Re-sends an invite's email (counts against the daily limit, like a fresh one). */
export async function resendGuestInvite(
  eventId: string,
  actingUser: UserModel,
  registrationId: string,
): Promise<void> {
  const event = await loadManageable(eventId, actingUser);
  const registration = await loadGuest(eventId, registrationId);
  if (registration.source !== EventRegistrationSource.invited) {
    throw new EventError(400, "Only invited guests can be re-sent an invitation.");
  }
  if (registration.revokedAt) throw new EventError(400, "This invitation was revoked.");

  const sentToday = await db.eventRegistration.count({
    where: { invitedById: actingUser.id, invitedAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  if (sentToday >= MAX_INVITES_PER_HOST_PER_DAY) {
    throw new EventError(400, "Daily invitation limit reached. Try again tomorrow.");
  }

  const host = await db.user.findUnique({ where: { id: event.hostId }, select: { name: true, email: true } });
  if (!host) throw new EventError(404, "Event not found.");
  await db.eventRegistration.update({
    where: { id: registration.id },
    data: { invitedAt: new Date(), invitedById: actingUser.id },
  });
  const result = await deliverInvite(event, host, registration, null);
  if (!result.ok) throw new EventError(502, "The email couldn't be sent. Try again shortly.");
}

/**
 * Cuts a guest off: their `rid` stops resolving in getEventMeetingStatus, so
 * the next status poll/token mint/chat call is rejected. Doesn't need the
 * event to still be upcoming — revoking after the fact is harmless and a
 * host may want to tidy the list.
 */
export async function revokeGuest(eventId: string, actingUser: UserModel, registrationId: string): Promise<void> {
  const event = await loadEvent(eventId);
  if (!event) throw new EventError(404, "Event not found.");
  if (actingUser.role !== Role.admin && event.hostId !== actingUser.id) {
    throw new EventError(403, "Only the event's host or an admin can manage guest invitations.");
  }
  const registration = await loadGuest(eventId, registrationId);
  await db.eventRegistration.update({ where: { id: registration.id }, data: { revokedAt: new Date() } });
}

function tokensMatch(expected: string | null, provided: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Throws unless `token` is the event's current guest link and the event can still take guests. */
async function loadForGuestLink(eventId: string, token: string) {
  const event = await loadEvent(eventId);
  // One message for "no such event", "feature off", "rotated" and "wrong token"
  // so the response can't be used to probe which of those it was.
  const invalid = new EventError(404, "This invitation link is no longer valid.");
  if (!event || !tokensMatch(event.guestLinkToken, token)) throw invalid;
  try {
    assertGuestFeatureAllowed(event);
  } catch {
    throw invalid;
  }
  return event;
}

/** What the guest-link landing page shows before asking for a name/email. */
export async function getGuestLinkPreview(
  eventId: string,
  token: string,
): Promise<{ title: string; startsAt: string; hostName: string }> {
  const event = await loadForGuestLink(eventId, token);
  const host = await db.user.findUnique({ where: { id: event.hostId }, select: { name: true } });
  return { title: event.title, startsAt: event.startsAt.toISOString(), hostName: host?.name ?? "NASIHA Member" };
}

/**
 * A visitor opened the private link and gave name + email. Email is required
 * on every platform — it's the only way to reach a plain-link guest later.
 *
 * Mirrors registerForEvent's rule for a repeat email: the registration id is
 * the join credential, and typing someone else's address proves nothing, so
 * the id is only returned for a brand-new registration; an existing one just
 * gets its join link emailed.
 */
export async function joinViaGuestLink(
  eventId: string,
  token: string,
  input: { name: string; email: string },
): Promise<{ created: boolean; registrationId: string | null }> {
  const event = await loadForGuestLink(eventId, token);
  const email = input.email.trim().toLowerCase();

  const existing = await db.eventRegistration.findFirst({
    where: { eventId, email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, revokedAt: true },
  });
  if (existing?.revokedAt) throw new EventError(403, "You no longer have access to this event.");

  let registration = existing;
  let created = false;
  if (!registration) {
    try {
      registration = await db.eventRegistration.create({
        data: { eventId, email, name: input.name, source: EventRegistrationSource.link },
        select: { id: true, name: true, revokedAt: true },
      });
      created = true;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      registration = await db.eventRegistration.findFirst({
        where: { eventId, email: { equals: email, mode: "insensitive" } },
        select: { id: true, name: true, revokedAt: true },
      });
      if (!registration) throw error;
    }
  }
  if (registration.revokedAt) throw new EventError(403, "You no longer have access to this event.");

  // Sent either way: the new guest's copy of their join link, or the
  // existing registrant's way back in (their id is never shown to the caller).
  await sendEventRegistrationConfirmationEmail(email, registration.name ?? input.name, {
    id: event.id,
    registrationId: registration.id,
    title: event.title,
    startsAt: event.startsAt,
    timezone: event.timezone,
    meetingUrl: event.meetingUrl,
    livekitRoomName: event.livekitRoomName,
    ...buildIcsFor(event),
  });

  return { created, registrationId: created ? registration.id : null };
}
