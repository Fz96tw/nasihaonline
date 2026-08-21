import "server-only";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import { sendCalendarIntegrationAlertEmail } from "@/lib/email";

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

/**
 * Surfaces a createMeetingCalendarEvent failure to every admin within
 * minutes instead of it only being discovered when a member notices a
 * missing Meet link days later (see the "Future is here convo" incident,
 * 2026-08-07, caused by an expired GOOGLE_CALENDAR_REFRESH_TOKEN). Not
 * called from the `!auth`/unconfigured branch below — that's an expected,
 * often-permanent state in dev/staging environments, not a "something that
 * used to work just broke" signal worth paging admins over. Best-effort on
 * top of an already-best-effort caller: this must never throw either.
 */
async function notifyAdminsOfMeetLinkFailure(topic: string, error: unknown): Promise<void> {
  try {
    const admins = await db.user.findMany({ where: { role: Role.admin }, select: { email: true, name: true } });
    const errorMessage = error instanceof Error ? error.message : String(error);
    await sendCalendarIntegrationAlertEmail(admins, { topic, errorMessage });
  } catch (alertError) {
    console.error("[google-calendar] Failed to notify admins of Meet link failure", alertError);
  }
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
  /** RFC 5545 "RRULE:..." line (from lib/recurrence.ts' buildRRuleString) — when set, creates a native recurring Calendar event instead of a one-off. */
  recurrenceRule?: string;
  /**
   * IANA zone (e.g. "America/New_York") for start/end. Google's Calendar API
   * accepts a bare UTC `dateTime` (trailing "Z") with no `timeZone` for a
   * one-off event, but *requires* an explicit `timeZone` once `recurrence`
   * is set — omitting it 400s with "Missing time zone definition for start
   * time" (confirmed live 2026-08-16). Always include when known, not just
   * for the recurring case, since it's also what Google uses to display the
   * event correctly to attendees regardless of recurrence.
   */
  timeZone?: string | null;
}): Promise<CreatedMeetingEvent> {
  const auth = getOAuthClient();
  if (!auth) {
    console.warn("[google-calendar] Google Calendar isn't configured — skipping Meet link creation");
    return { meetingUrl: null, googleEventId: null };
  }

  const durationMinutes = input.durationMinutes ?? DEFAULT_MEETING_DURATION_MINUTES;
  const endsAt = new Date(input.startsAt.getTime() + durationMinutes * 60_000);
  const timeZone = input.timeZone ?? undefined;

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: input.topic,
        description: input.description,
        start: { dateTime: input.startsAt.toISOString(), timeZone },
        end: { dateTime: endsAt.toISOString(), timeZone },
        attendees: input.attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.name })),
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
        ...(input.recurrenceRule ? { recurrence: [input.recurrenceRule] } : {}),
      },
    });

    const meetingUrl = response.data.hangoutLink ?? null;

    // Separate try/catch from the block above: a failed accessType patch
    // must not discard an otherwise-successful Calendar event/Meet link.
    // The space's server-generated `meetingCode` (the last path segment of
    // the hangout link, e.g. "abc-mnop-xyz") doubles as a valid alias for
    // the space's resource name for API calls, per the Meet API docs.
    if (meetingUrl) {
      try {
        const meetingCode = meetingUrl.split("/").pop();
        const meet = google.meet({ version: "v2", auth });
        await meet.spaces.patch({
          name: `spaces/${meetingCode}`,
          updateMask: "config.accessType",
          requestBody: { config: { accessType: "OPEN" } },
        });
      } catch (error) {
        console.error("[google-calendar] Failed to open Meet space lobby (accessType: OPEN)", error);
        await notifyAdminsOfMeetLinkFailure(`${input.topic} (Meet lobby open)`, error);
      }
    }

    return {
      meetingUrl,
      googleEventId: response.data.id ?? null,
    };
  } catch (error) {
    console.error("[google-calendar] Failed to create meeting calendar event", error);
    await notifyAdminsOfMeetLinkFailure(input.topic, error);
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
 * Patches the start/end time on a Calendar event created by
 * createMeetingCalendarEvent() — used when a restricted Event with an
 * auto-generated Meet link is rescheduled, so attendees' own Google
 * Calendar entries (and the Meet invite Google originally emailed them)
 * move too instead of silently going stale. sendUpdates: "all" makes
 * Google email each attendee an updated invite. Best-effort, same
 * non-fatal philosophy as the rest of this file: a failed/unconfigured
 * Google call must never block the reschedule itself, since Event.startsAt/
 * endsAt is the source of truth.
 */
export async function updateMeetingCalendarEventTime(
  googleEventId: string,
  startsAt: Date,
  endsAt: Date | null,
  timeZone?: string | null,
): Promise<void> {
  const auth = getOAuthClient();
  if (!auth) {
    console.warn("[google-calendar] Google Calendar isn't configured — skipping event time sync");
    return;
  }

  // Mirrors createMeetingCalendarEvent's fallback: an Event without an
  // explicit endsAt still needs a real end time for the Calendar API.
  const resolvedEndsAt = endsAt ?? new Date(startsAt.getTime() + DEFAULT_MEETING_DURATION_MINUTES * 60_000);
  const resolvedTimeZone = timeZone ?? undefined;

  try {
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: googleEventId,
      sendUpdates: "all",
      requestBody: {
        start: { dateTime: startsAt.toISOString(), timeZone: resolvedTimeZone },
        end: { dateTime: resolvedEndsAt.toISOString(), timeZone: resolvedTimeZone },
      },
    });
  } catch (error) {
    console.error("[google-calendar] Failed to sync meeting calendar event time", error);
  }
}

/**
 * Patches the recurrence rule on a Calendar event created by
 * createMeetingCalendarEvent() with a recurrenceRule — used when a host
 * edits a recurring event's repeat schedule. `recurrenceRule: null` clears
 * recurrence (verify empirically against a real calendar before relying on
 * this: Google's own `recurrence: []` semantics for "convert back to a
 * single event" aren't guaranteed the same across API versions — this
 * plan's assumption is untested against production Calendar behavior). If
 * the new BYDAY no longer includes the master's own start.dateTime weekday,
 * Google still accepts the patch but the master's own start.dateTime stays
 * on the old weekday while instances follow the new rule — cosmetically odd
 * in Google's own UI, harmless here since this app never reads start.dateTime
 * back. Best-effort, same non-fatal philosophy as the rest of this file.
 */
export async function updateMeetingCalendarEventRecurrence(
  googleEventId: string,
  recurrenceRule: string | null,
): Promise<void> {
  const auth = getOAuthClient();
  if (!auth) {
    console.warn("[google-calendar] Google Calendar isn't configured — skipping recurrence sync");
    return;
  }

  try {
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: googleEventId,
      sendUpdates: "all",
      requestBody: {
        recurrence: recurrenceRule ? [recurrenceRule] : [],
      },
    });
  } catch (error) {
    console.error("[google-calendar] Failed to sync meeting calendar event recurrence", error);
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
