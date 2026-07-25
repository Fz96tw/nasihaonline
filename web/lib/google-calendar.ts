import "server-only";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? "primary";

const DEFAULT_MEETING_DURATION_MINUTES = 30;

/**
 * Meeting requests (§4.7) have no Google Workspace domain to lean on, so a
 * bare service-account key can't generate Meet links (that requires
 * domain-wide delegation). Instead the app authenticates once as a single
 * dedicated Gmail account via a long-lived OAuth refresh token (obtained via
 * scripts/get-google-refresh-token.ts) and creates every meeting "as" that
 * account.
 */
function getOAuthClient() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) return null;
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  client.setCredentials({ refresh_token: REFRESH_TOKEN });
  return client;
}

export type CreatedMeetingEvent = { meetingUrl: string | null; googleEventId: string | null };

/**
 * Creates a Calendar event with an auto-generated Google Meet link
 * (conferenceDataVersion: 1) and both parties as attendees. sendUpdates:
 * "all" makes Google email each attendee a normal calendar invite (Accept/
 * Decline, add-to-calendar) directly from their own inbox — no separate
 * .ics handling needed for that.
 *
 * Best-effort, same non-fatal philosophy as every send*Email function in
 * lib/email.ts: unconfigured or failing Google credentials must never block
 * a meeting-request acceptance, since the MeetingRequest/ledger rows are the
 * source of truth. Returns nulls instead of throwing.
 */
export async function createMeetingCalendarEvent(input: {
  topic: string;
  startsAt: Date;
  durationMinutes?: number;
  attendees: { email: string; name: string }[];
  description?: string;
}): Promise<CreatedMeetingEvent> {
  const auth = getOAuthClient();
  if (!auth) {
    console.warn("[google-calendar] Google Calendar isn't configured — skipping Meet link creation");
    return { meetingUrl: null, googleEventId: null };
  }

  const durationMinutes = input.durationMinutes ?? DEFAULT_MEETING_DURATION_MINUTES;
  const endsAt = new Date(input.startsAt.getTime() + durationMinutes * 60_000);

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: input.topic,
        description: input.description,
        start: { dateTime: input.startsAt.toISOString() },
        end: { dateTime: endsAt.toISOString() },
        attendees: input.attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.name })),
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    return {
      meetingUrl: response.data.hangoutLink ?? null,
      googleEventId: response.data.id ?? null,
    };
  } catch (error) {
    console.error("[google-calendar] Failed to create meeting calendar event", error);
    return { meetingUrl: null, googleEventId: null };
  }
}

/**
 * Replaces the attendee list on a Calendar event created by
 * createMeetingCalendarEvent() — used when a restricted Event's invited
 * list is edited after creation (Audience-Restricted Group Events,
 * Objective 03), so a removed invitee stops being a Google Calendar
 * attendee too. sendUpdates: "all" makes Google email the change to
 * whoever's still on the list. Best-effort, same non-fatal philosophy as
 * the rest of this file: a failed/unconfigured Google call must never
 * block the invite-list edit itself, since EventInvitee is the source of
 * truth for who's actually invited.
 */
export async function updateMeetingCalendarEventAttendees(
  googleEventId: string,
  attendees: { email: string; name: string }[],
): Promise<void> {
  const auth = getOAuthClient();
  if (!auth) {
    console.warn("[google-calendar] Google Calendar isn't configured — skipping attendee sync");
    return;
  }

  try {
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: googleEventId,
      sendUpdates: "all",
      requestBody: {
        attendees: attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.name })),
      },
    });
  } catch (error) {
    console.error("[google-calendar] Failed to sync meeting calendar event attendees", error);
  }
}

/**
 * Deletes a Calendar event created by createMeetingCalendarEvent(), used
 * when either party cancels an accepted meeting request. sendUpdates: "all"
 * makes Google email both attendees a cancellation notice — same
 * non-fatal philosophy as the rest of this file: a failed/unconfigured
 * Google call must never block the cancellation itself, since the
 * MeetingRequest row is the source of truth.
 */
export async function cancelMeetingCalendarEvent(googleEventId: string): Promise<void> {
  const auth = getOAuthClient();
  if (!auth) {
    console.warn("[google-calendar] Google Calendar isn't configured — skipping event cancellation");
    return;
  }

  try {
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: googleEventId, sendUpdates: "all" });
  } catch (error) {
    console.error("[google-calendar] Failed to cancel meeting calendar event", error);
  }
}
