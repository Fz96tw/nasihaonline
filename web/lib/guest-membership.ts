import "server-only";
import { db } from "@/lib/db";
import { findDuplicateApplicant } from "@/lib/applications";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

/**
 * Event guest → membership applicant (External Guests on Private Events,
 * objective 4). A guest's EventRegistration id doubles as the `gi` on
 * /join?gi=… — it's already their personal credential, so it can prefill
 * their own name/email and attribute the referral without minting a new
 * token. Nothing here bypasses review: it only fills the form and records
 * who referred them.
 */

/** Live (not revoked) guest registration with what a referral needs. */
async function loadGuestRegistration(registrationId: string) {
  const registration = await db.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      email: true,
      name: true,
      revokedAt: true,
      invitedBy: { select: { id: true, name: true } },
      event: { select: { id: true, title: true, host: { select: { id: true, name: true } } } },
    },
  });
  if (!registration || registration.revokedAt) return null;
  // The member who emailed the invitation, else the event's host (a link or
  // public-registration guest was still brought in by that event).
  const referrer = registration.invitedBy ?? registration.event.host;
  return { ...registration, referrer };
}

/** The guest's apply-to-join link, or null if they're already a member or have an application in. */
export async function guestJoinInviteUrl(registrationId: string, email: string): Promise<string | null> {
  if (await findDuplicateApplicant(email.toLowerCase())) return null;
  return `${APP_URL}/join?gi=${encodeURIComponent(registrationId)}`;
}

/** Same as guestJoinInviteUrl, looked up from the registration id alone. */
export async function guestJoinInviteUrlFor(registrationId: string): Promise<string | null> {
  const registration = await loadGuestRegistration(registrationId);
  return registration ? guestJoinInviteUrl(registrationId, registration.email) : null;
}

export interface GuestJoinPrefill {
  firstName: string;
  lastName: string;
  email: string;
  referrerName: string | null;
  eventTitle: string;
}

/** What /join?gi= prefills. Null for an unknown/revoked id — the page falls back to the empty form. */
export async function getGuestJoinPrefill(registrationId: string): Promise<GuestJoinPrefill | null> {
  const registration = await loadGuestRegistration(registrationId);
  if (!registration) return null;
  const name = registration.name?.trim() ?? "";
  const space = name.indexOf(" ");
  return {
    firstName: space === -1 ? name : name.slice(0, space),
    lastName: space === -1 ? "" : name.slice(space + 1).trim(),
    email: registration.email,
    referrerName: registration.referrer.name,
    eventTitle: registration.event.title,
  };
}

/** Referral columns for an application submitted from /join?gi= — empty when the id doesn't resolve. */
export async function resolveGuestReferral(
  registrationId: string | null | undefined,
): Promise<{ referredByUserId: string; referredViaEventId: string } | Record<string, never>> {
  if (!registrationId) return {};
  const registration = await loadGuestRegistration(registrationId);
  if (!registration) return {};
  return { referredByUserId: registration.referrer.id, referredViaEventId: registration.event.id };
}
