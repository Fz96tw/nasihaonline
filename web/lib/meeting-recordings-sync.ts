// No "server-only" guard: imported by scripts/worker.ts (the periodic
// meeting-recordings sweep), which runs outside Next's server runtime —
// same convention as lib/surveys-lifecycle.ts and lib/search-index-sync.ts.
// Duplicates lib/google-calendar.ts's OAuth client setup rather than
// importing it (that module starts with `import "server-only"`), matching
// the existing precedent in scripts/reopen-meet-lobbies.ts and
// scripts/backfill-meet-links.ts.
import { google, type meet_v2 } from "googleapis";
import { db } from "@/lib/db";
import { MeetingRequestStatus } from "@/lib/generated/prisma/enums";
import { expandOccurrences, type RecurrenceInput } from "@/lib/recurrence";

/**
 * Every meeting is recorded by default (lib/google-calendar.ts), but Google
 * only makes the recording available some time after the call ends — there's
 * no webhook for this, so it has to be polled for. Candidates are only ever
 * considered within this trailing window: too-recent occurrences haven't
 * had time to process yet (BUFFER_MS), and anything older than LOOKBACK_MS
 * is assumed to have failed (no recording started, meeting never happened,
 * etc.) and is silently given up on — same best-effort philosophy as the
 * rest of this codebase's Google integration.
 */
const BUFFER_MS = 20 * 60 * 1000;
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000;

/** How far past an occurrence's start to search for its conference record — generous, since a late start or a long session shouldn't cause a miss. */
const CONFERENCE_SEARCH_WINDOW_BEFORE_MS = 60 * 60 * 1000;
const CONFERENCE_SEARCH_WINDOW_AFTER_MS = 12 * 60 * 60 * 1000;

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

type FoundRecording = { recordingUrl: string; driveFileId: string };

/**
 * Finds the finished recording (if any) for one occurrence of a Meet space,
 * by matching the closest ConferenceRecord to `occurrenceStart` within the
 * search window. Returns null if nothing's ready yet — the caller just
 * leaves the candidate for a later sweep. `driveFileId` (distinct from the
 * `recordingUrl` playback link) is what a later "delete this recording"
 * action needs to actually remove the file via the Drive API.
 */
async function findRecording(meet: meet_v2.Meet, meetingCode: string, occurrenceStart: Date): Promise<FoundRecording | null> {
  const windowStart = new Date(occurrenceStart.getTime() - CONFERENCE_SEARCH_WINDOW_BEFORE_MS);
  const windowEnd = new Date(occurrenceStart.getTime() + CONFERENCE_SEARCH_WINDOW_AFTER_MS);
  const filter = [
    `space.meeting_code = "${meetingCode}"`,
    `start_time >= "${windowStart.toISOString()}"`,
    `start_time <= "${windowEnd.toISOString()}"`,
    `end_time IS NOT NULL`,
  ].join(" AND ");

  const { data } = await meet.conferenceRecords.list({ filter });
  const records = data.conferenceRecords ?? [];
  if (records.length === 0) return null;

  // Closest match by start_time, in case more than one session in this
  // space fell inside the (generous) search window.
  const closest = records.reduce((best, record) => {
    if (!record.startTime) return best;
    if (!best?.startTime) return record;
    const recordDelta = Math.abs(new Date(record.startTime).getTime() - occurrenceStart.getTime());
    const bestDelta = Math.abs(new Date(best.startTime).getTime() - occurrenceStart.getTime());
    return recordDelta < bestDelta ? record : best;
  }, records[0]);
  if (!closest?.name) return null;

  const { data: recordingsData } = await meet.conferenceRecords.recordings.list({ parent: closest.name });
  const ready = (recordingsData.recordings ?? []).find(
    (recording) => recording.driveDestination?.exportUri && recording.driveDestination.file,
  );
  if (!ready?.driveDestination?.exportUri || !ready.driveDestination.file) return null;
  return { recordingUrl: ready.driveDestination.exportUri, driveFileId: ready.driveDestination.file };
}

/**
 * Sweeps recently-past Events and MeetingRequests with an auto-generated
 * Meet link for a finished recording, attaching the Drive playback link
 * once Google's made one available. Called on a repeating schedule from
 * scripts/worker.ts (lib/queues/meeting-recording-sync-queue.ts) — never
 * inline in a request handler, and best-effort throughout: a failed lookup
 * for one meeting must never block the rest of the sweep.
 */
export async function syncMeetingRecordings(): Promise<void> {
  const auth = getOAuthClient();
  if (!auth) {
    console.warn("[meeting-recordings-sync] Google Calendar isn't configured — skipping sweep");
    return;
  }
  const meet = google.meet({ version: "v2", auth });

  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOKBACK_MS);
  const windowEnd = new Date(now.getTime() - BUFFER_MS);

  await syncEventRecordings(meet, windowStart, windowEnd);
  await syncMeetingRequestRecordings(meet, windowStart, windowEnd);
}

async function syncEventRecordings(meet: meet_v2.Meet, windowStart: Date, windowEnd: Date): Promise<void> {
  const events = await db.event.findMany({
    where: { meetingUrl: { startsWith: "https://meet.google.com/" }, cancelledAt: null },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      meetingUrl: true,
      recurrence: { select: { frequency: true, interval: true, byWeekday: true, until: true } },
    },
  });

  for (const event of events) {
    if (!event.meetingUrl) continue;
    const meetingCode = event.meetingUrl.split("/").pop();
    if (!meetingCode) continue;

    const occurrenceStarts = event.recurrence
      ? expandOccurrences(event, event.recurrence as RecurrenceInput, windowStart, windowEnd).map((o) => o.occurrenceStart)
      : isWithin(event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_EVENT_DURATION_MS), windowStart, windowEnd)
        ? [event.startsAt]
        : [];

    for (const occurrenceStart of occurrenceStarts) {
      const existing = await db.eventRecording.findUnique({
        where: { eventId_occurrenceDate: { eventId: event.id, occurrenceDate: occurrenceStart } },
        select: { id: true },
      });
      if (existing) continue;

      try {
        const found = await findRecording(meet, meetingCode, occurrenceStart);
        if (!found) continue;
        await db.eventRecording.create({
          data: { eventId: event.id, occurrenceDate: occurrenceStart, ...found },
        });
        console.log(`[meeting-recordings-sync] attached recording for event ${event.id} @ ${occurrenceStart.toISOString()}`);
      } catch (error) {
        console.error(`[meeting-recordings-sync] failed to sync recording for event ${event.id}`, error);
      }
    }
  }
}

async function syncMeetingRequestRecordings(meet: meet_v2.Meet, windowStart: Date, windowEnd: Date): Promise<void> {
  const meetingRequests = await db.meetingRequest.findMany({
    where: {
      meetingUrl: { startsWith: "https://meet.google.com/" },
      recordingUrl: null,
      scheduledAt: { gte: windowStart, lte: windowEnd },
      status: {
        in: [
          MeetingRequestStatus.accepted,
          MeetingRequestStatus.reschedule_by_sender,
          MeetingRequestStatus.reschedule_by_recipient,
        ],
      },
    },
    select: { id: true, meetingUrl: true, scheduledAt: true },
  });

  for (const meetingRequest of meetingRequests) {
    if (!meetingRequest.meetingUrl || !meetingRequest.scheduledAt) continue;
    const meetingCode = meetingRequest.meetingUrl.split("/").pop();
    if (!meetingCode) continue;

    try {
      const found = await findRecording(meet, meetingCode, meetingRequest.scheduledAt);
      if (!found) continue;
      await db.meetingRequest.update({ where: { id: meetingRequest.id }, data: found });
      console.log(`[meeting-recordings-sync] attached recording for meeting request ${meetingRequest.id}`);
    } catch (error) {
      console.error(`[meeting-recordings-sync] failed to sync recording for meeting request ${meetingRequest.id}`, error);
    }
  }
}

function isWithin(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}
