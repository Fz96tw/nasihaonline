import "dotenv/config";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { db } from "@/lib/db";

/**
 * One-off backfill for the two rows whose auto-generated Google Meet link
 * failed to attach during the 2026-08-07 GOOGLE_CALENDAR_REFRESH_TOKEN
 * outage (invalid_grant) — the MeetingRequest "Website update" and the Event
 * "Future is here convo". Scoped to exact ids rather than a blanket
 * "meetingUrl IS NULL" sweep: sendUpdates: "all" (below) emails every
 * attendee a real calendar invite, so this must only touch rows confirmed
 * to be outage casualties, not every historical null (which includes
 * deliberately-manual events and rows that predate the auto-Meet feature
 * entirely).
 *
 * Duplicates (rather than imports) lib/google-calendar.ts's
 * createMeetingCalendarEvent — that module starts with `import "server-only"`,
 * which unconditionally throws outside Next.js's build (it only no-ops under
 * the "react-server" package-export condition Next's webpack config
 * resolves), so a plain tsx/node script can't import it directly.
 *
 *   npx tsx scripts/backfill-meet-links.ts
 */
const MEETING_REQUEST_ID = "cmsj4dlkz00088pnp2ckfkui6";
const EVENT_ID = "cmsj6j6bf00008pnpc3zpj60r";

async function createMeetingCalendarEvent(input: {
  topic: string;
  startsAt: Date;
  durationMinutes?: number;
  attendees: { email: string; name: string }[];
  description?: string;
}): Promise<{ meetingUrl: string | null; googleEventId: string | null }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";
  if (!clientId || !clientSecret || !refreshToken) {
    console.warn("[backfill] Google Calendar isn't configured — skipping Meet link creation");
    return { meetingUrl: null, googleEventId: null };
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const durationMinutes = input.durationMinutes ?? 30;
  const endsAt = new Date(input.startsAt.getTime() + durationMinutes * 60_000);

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const response = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: input.topic,
        description: input.description,
        start: { dateTime: input.startsAt.toISOString() },
        end: { dateTime: endsAt.toISOString() },
        attendees: input.attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.name })),
        conferenceData: {
          createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      },
    });

    return { meetingUrl: response.data.hangoutLink ?? null, googleEventId: response.data.id ?? null };
  } catch (error) {
    console.error("[backfill] Failed to create meeting calendar event", error);
    return { meetingUrl: null, googleEventId: null };
  }
}

async function backfillMeetingRequest(id: string) {
  const meetingRequest = await db.meetingRequest.findUnique({
    where: { id },
    include: {
      sender: { select: { email: true, name: true } },
      recipient: { select: { email: true, name: true } },
    },
  });
  if (!meetingRequest) {
    console.log(`MeetingRequest ${id}: not found, skipping.`);
    return;
  }
  if (meetingRequest.meetingUrl) {
    console.log(`MeetingRequest ${id}: already has a Meet link, skipping.`);
    return;
  }
  if (!meetingRequest.scheduledAt) {
    console.log(`MeetingRequest ${id}: no scheduledAt, skipping.`);
    return;
  }

  const createdMessage = await db.meetingRequestMessage.findFirst({
    where: { meetingRequestId: id, action: "created" },
    select: { body: true },
  });

  const { meetingUrl, googleEventId } = await createMeetingCalendarEvent({
    topic: meetingRequest.topic,
    startsAt: meetingRequest.scheduledAt,
    attendees: [
      { email: meetingRequest.sender.email, name: meetingRequest.sender.name ?? "there" },
      { email: meetingRequest.recipient.email, name: meetingRequest.recipient.name ?? "there" },
    ],
    description: createdMessage?.body ?? undefined,
  });

  if (!meetingUrl) {
    console.log(`MeetingRequest ${id}: Google call failed again — no Meet link created.`);
    return;
  }

  await db.meetingRequest.update({ where: { id }, data: { meetingUrl, googleEventId } });
  console.log(`MeetingRequest ${id}: backfilled ${meetingUrl}`);
}

async function backfillEvent(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    include: {
      host: { select: { email: true, name: true } },
      invitees: { include: { user: { select: { email: true, name: true } } } },
    },
  });
  if (!event) {
    console.log(`Event ${id}: not found, skipping.`);
    return;
  }
  if (event.meetingUrl) {
    console.log(`Event ${id}: already has a Meet link, skipping.`);
    return;
  }

  const attendees = [
    { email: event.host.email, name: event.host.name ?? "Member" },
    ...event.invitees.map((invitee) => ({ email: invitee.user.email, name: invitee.user.name ?? "Member" })),
  ];

  const { meetingUrl, googleEventId } = await createMeetingCalendarEvent({
    topic: event.title,
    startsAt: event.startsAt,
    durationMinutes: event.endsAt
      ? Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000)
      : undefined,
    attendees,
    description: event.description ?? undefined,
  });

  if (!meetingUrl) {
    console.log(`Event ${id}: Google call failed again — no Meet link created.`);
    return;
  }

  await db.event.update({ where: { id }, data: { meetingUrl, googleEventId } });
  console.log(`Event ${id}: backfilled ${meetingUrl}`);
}

async function main() {
  await backfillMeetingRequest(MEETING_REQUEST_ID);
  await backfillEvent(EVENT_ID);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
