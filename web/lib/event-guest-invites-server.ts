import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { EventVisibility, EventRegistrationSource, Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import {
  buildEventIcs,
  buildEventInviteAttachment,
  EventError,
  eventGuestAccessExpired,
  syncGoogleCalendarAttendees,
  updateEventInvitees,
} from "@/lib/events-server";
import { sendEventGuestInviteEmail, sendEventLifecycleEmail, sendEventRegistrationConfirmationEmail } from "@/lib/email";
import { parseGuestAddress, splitGuestAddresses } from "@/lib/guest-address";
import { guestJoinInviteUrl } from "@/lib/guest-membership";

/**
 * Private guest-invite link + invite-by-email for `open` events, and
 * invite-by-email (no shareable link) for restricted (`invited`) events.
 *
 * Everything an anonymous guest does after getting in still keys on an
 * EventRegistration id (`?rid=`), re-validated by getEventMeetingStatus on
 * every status/token/chat call — this module only decides how a
 * registration comes to exist (host-typed invite, or the event's private
 * link) and lets the host revoke one. It never adds a second way to be
 * authorised in the meeting itself.
 */

import {
  MAX_INVITES_PER_EVENT,
  MAX_INVITES_PER_HOST_PER_DAY,
  MAX_INVITES_PER_REQUEST,
} from "@/lib/event-guest-invite-limits";

export { MAX_INVITES_PER_EVENT, MAX_INVITES_PER_HOST_PER_DAY, MAX_INVITES_PER_REQUEST };

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
  /** False for a restricted event — email invitations only, never a shareable link. */
  linkAvailable: boolean;
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
  googleEventId: true,
  guestLinkToken: true,
  recurrence: { select: { frequency: true, interval: true, byWeekday: true, until: true } },
} as const;

type GuestEvent = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

function loadEvent(eventId: string) {
  return db.event.findUnique({ where: { id: eventId }, select: eventSelect });
}

function isRestricted(event: { visibility: EventVisibility }) {
  return event.visibility === EventVisibility.invited;
}

/**
 * Whether this event may take guests at all — published, live, and either
 * public (`open`) or restricted. The shareable link (`link: true`) is
 * public-only: anyone can forward it, which a restricted event's named
 * audience rules out; a restricted event only takes guests the host names
 * by email.
 */
function assertGuestFeatureAllowed(event: GuestEvent | null, { link }: { link: boolean }): asserts event is GuestEvent {
  if (!event) throw new EventError(404, "Event not found.");
  if (event.cancelledAt) throw new EventError(400, "This event has been cancelled.");
  if (link ? !event.open || isRestricted(event) : !event.open && !isRestricted(event)) {
    throw new EventError(
      400,
      link ? "Guest links are only available for public events." : "Guests can only be invited to public or private events.",
    );
  }
  if (!event.publishedAt) throw new EventError(400, "Publish this event before inviting guests.");
  // A recurring event's startsAt is only its anchor, so only a one-off can be "over".
  if (!event.recurrence && (event.endsAt ?? event.startsAt).getTime() < Date.now()) {
    throw new EventError(400, "This event has already taken place.");
  }
}

async function loadManageable(eventId: string, actingUser: UserModel, { link }: { link: boolean }): Promise<GuestEvent> {
  const event = await loadEvent(eventId);
  if (!event) throw new EventError(404, "Event not found.");
  if (actingUser.role !== Role.admin && event.hostId !== actingUser.id) {
    throw new EventError(403, "Only the event's host or an admin can manage guest invitations.");
  }
  assertGuestFeatureAllowed(event, { link });
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
  return { token: event.guestLinkToken, linkAvailable: !isRestricted(event), guests: guests.map(rowOf) };
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
  const event = await loadManageable(eventId, actingUser, { link: true });
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
  | { email: string; status: "member_invited"; message: string }
  | {
      email: string;
      status: "invalid" | "duplicate" | "already_registered" | "revoked_guest" | "failed" | "limit" | "member_not_invitable";
      message: string;
    };

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
  registration: { id: string; email: string; inviteToJoin: boolean },
  note: string | null,
) {
  return sendEventGuestInviteEmail({
    to: registration.email,
    hostName: host.name ?? "A NASIHA member",
    hostEmail: host.email,
    note,
    // Re-checked on every send (incl. resends): someone who has since
    // applied or become a member doesn't get asked again.
    joinInviteUrl: registration.inviteToJoin ? await guestJoinInviteUrl(registration.id, registration.email) : null,
    event: {
      id: event.id,
      registrationId: registration.id,
      title: event.title,
      startsAt: event.startsAt,
      timezone: event.timezone,
      meetingUrl: event.meetingUrl,
      livekitRoomName: event.livekitRoomName,
      // A Meet-backed restricted event lists its guests on the Google
      // Calendar event (syncGoogleCalendarAttendees), and Google sends them
      // its own invite — attaching ours too would double the calendar entry.
      ics: googleInvitesGuests(event) ? null : guestCalendarInvite(event, registration, "REQUEST"),
    },
  });
}

/** Google Calendar, not us, sends this event's guests their invite/cancellation. */
function googleInvitesGuests(event: GuestEvent) {
  return isRestricted(event) && event.googleEventId !== null;
}

/**
 * A real iTIP invite (METHOD/ORGANIZER/ATTENDEE, same UID every time), so a
 * later CANCEL for the same guest removes the entry the invitation created —
 * a plain "add to calendar" file can't be withdrawn that way.
 */
function guestCalendarInvite(
  event: GuestEvent,
  guest: { email: string; name?: string | null },
  method: "REQUEST" | "CANCEL",
) {
  return buildEventInviteAttachment(
    {
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      meetingUrl: event.meetingUrl,
      livekitRoomName: event.livekitRoomName,
      recurrence: event.recurrence,
      recurrenceAnchor: event.startsAt,
    },
    method,
    { email: guest.email, name: guest.name ?? null },
  );
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
  input: { emails: string[]; note?: string | null; inviteToJoin?: boolean },
): Promise<GuestInviteOutcome[]> {
  // Email invitations don't depend on the shareable link — on a public
  // event that's a separate, optional toggle.
  const event = await loadManageable(eventId, actingUser, { link: false });
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
    // An entry may be `Jane Doe <jane@example.com>` — the name prefills the
    // guest's own name prompt when they first open the meeting.
    const address = parseGuestAddress(raw);
    const parsed = emailSchema.safeParse(address.email);
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

    // A restricted event's audience is its invite list — an address that
    // belongs to a member joins that list (bell notification, member
    // calendar, their own account in the meeting) instead of becoming an
    // anonymous guest. Public events keep treating every address as a guest.
    if (isRestricted(event)) {
      const member = await db.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (member) {
        outcomes.push(await inviteMemberInstead(event, actingUser, member.id, email));
        continue;
      }
    }

    const existing = await db.eventRegistration.findFirst({
      where: { eventId, email: { equals: email, mode: "insensitive" } },
      select: { id: true, source: true, revokedAt: true, name: true },
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

    let registration: { id: string; email: string; inviteToJoin: boolean };
    try {
      registration = existing
        ? await db.eventRegistration.update({
            where: { id: existing.id },
            // Re-inviting a revoked invite brings them back. A name only
            // fills a blank — never overwrites one the guest already gave.
            data: {
              invitedAt: new Date(),
              invitedById: actingUser.id,
              revokedAt: null,
              ...(!existing.name && address.name ? { name: address.name } : {}),
              // Only ever switched on here — unticking it on a later send
              // doesn't withdraw an apply-to-join link already emailed.
              ...(input.inviteToJoin ? { inviteToJoin: true } : {}),
            },
            select: { id: true, email: true, inviteToJoin: true },
          })
        : await db.eventRegistration.create({
            data: {
              eventId,
              email,
              name: address.name,
              source: EventRegistrationSource.invited,
              invitedAt: new Date(),
              invitedById: actingUser.id,
              inviteToJoin: input.inviteToJoin ?? false,
            },
            select: { id: true, email: true, inviteToJoin: true },
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
  if (isRestricted(event) && outcomes.some((outcome) => outcome.status === "sent")) {
    await syncGoogleCalendarAttendees(eventId);
  }
  return outcomes;
}

async function inviteMemberInstead(
  event: GuestEvent,
  actingUser: UserModel,
  memberId: string,
  email: string,
): Promise<GuestInviteOutcome> {
  if (memberId === event.hostId) {
    return { email, status: "member_not_invitable", message: "That's the host's own address." };
  }
  const already = await db.eventInvitee.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: memberId } },
    select: { id: true },
  });
  if (already) return { email, status: "member_invited", message: "Already invited as a member." };
  // updateEventInvitees applies the same Directory eligibility as the member
  // picker and silently skips anyone outside it — surface that instead.
  const { added } = await updateEventInvitees(event.id, actingUser, { addUserIds: [memberId], removeUserIds: [] });
  return added > 0
    ? { email, status: "member_invited", message: "This is a member — added to the invited members instead." }
    : {
        email,
        status: "member_not_invitable",
        message: "This address belongs to a member who can't be invited (not listed in the Directory).",
      };
}

async function loadGuest(eventId: string, registrationId: string) {
  const registration = await db.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, eventId: true, email: true, name: true, source: true, revokedAt: true, inviteToJoin: true },
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
  const event = await loadManageable(eventId, actingUser, { link: false });
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
  if (registration.revokedAt) return;
  await db.eventRegistration.update({ where: { id: registration.id }, data: { revokedAt: new Date() } });
  if (googleInvitesGuests(event)) {
    // Taking them off the Google event makes Google send the cancellation.
    await syncGoogleCalendarAttendees(eventId);
    return;
  }
  // Nothing to withdraw from someone who can no longer attend anyway.
  if (event.cancelledAt || eventGuestAccessExpired(event)) return;
  const host = await db.user.findUnique({ where: { id: event.hostId }, select: { name: true } });
  await sendEventLifecycleEmail(registration.email, registration.name ?? "there", {
    subject: `Invitation withdrawn: ${event.title}`,
    message: `${host?.name ?? "The host"} has removed you from "${event.title}", so your invitation and join link no longer work. We've attached a calendar update that removes it from your calendar.`,
    ics: guestCalendarInvite(event, registration, "CANCEL"),
  });
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
    assertGuestFeatureAllowed(event, { link: true });
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

/**
 * The create/publish form's "External guests" box (restricted or public event) —
 * emailed once the event is actually published (a draft never stores the
 * list). Returns one line per address that didn't go out, or the overall
 * error, so the form can tell the host what to retry from the event page;
 * never throws, since the event itself has already been published.
 */
export async function inviteExternalGuestsOnPublish(
  eventId: string,
  actingUser: UserModel,
  externalGuests: string,
): Promise<string[]> {
  const emails = splitGuestAddresses(externalGuests);
  if (emails.length === 0) return [];
  try {
    const outcomes = await inviteGuestsByEmail(eventId, actingUser, { emails });
    return outcomes.flatMap((outcome) =>
      outcome.status === "sent" || outcome.status === "member_invited" ? [] : [`${outcome.email} — ${outcome.message}`],
    );
  } catch (error) {
    if (error instanceof EventError) return [error.message];
    throw error;
  }
}
