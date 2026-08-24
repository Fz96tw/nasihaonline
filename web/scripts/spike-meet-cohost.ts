import "dotenv/config";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";

/**
 * Feasibility spike for objective 0c41063c ("Give the event/meeting
 * organizer real Google Meet host powers via co-host").
 *
 * 2026-08-23 finding: the sibling accessType-OPEN patch (dba4d83d) has 403'd
 * "Permission denied on resource Space" on every attempt since 2026-08-20,
 * for every scope combination tried, against a space *created via Calendar's*
 * conferenceData.createRequest (see ../../google-support-ticket.md). Reads
 * succeed against the same space/token; only writes fail. This spike tests
 * the alternative architecture the objective's description was updated to
 * recommend: create the Meet space directly via the Meet API's own
 * spaces.create (never going through Calendar for space creation), then
 * write to *that* space instead. Three things get tested, in order:
 *
 *   1. spaces.create with config.accessType set inline in the request body
 *      — does setting accessType at creation time (not via a later patch)
 *      avoid the write-permission wall entirely?
 *   2. Adding the given email as a COHOST member of the resulting space, via
 *      a raw HTTPS call to the v2beta spaces.members endpoint — the
 *      installed googleapis@173 client only ships the v2 surface, which has
 *      no Members resource at all (confirmed: no "Members" in
 *      node_modules/googleapis/build/src/apis/meet/v2.d.ts), so this can't
 *      go through the SDK. Uses the same OAuth2Client's own .request()
 *      method, which signs the request with the same bearer token the SDK
 *      calls use.
 *   3. Linking the resulting space into a real Calendar event via
 *      conferenceData.conferenceId (not createRequest) + conferenceDataVersion: 1
 *      — confirms an event created this way still gets sendUpdates invites
 *      and a working hangoutLink, i.e. that switching space-creation order
 *      doesn't break the existing Calendar-invite behavior. This event is
 *      deleted at the end of the run so it doesn't clutter the calendar or
 *      spam a real attendee.
 *
 * Requires a refresh token minted with the meetings.space.created scope
 * (just added to SCOPES in get-google-refresh-token.ts) — re-run that
 * script signed in as the dedicated Gmail account and set the resulting
 * GOOGLE_CALENDAR_REFRESH_TOKEN in web/.env before running this. The
 * existing token (missing that scope) will make step 1 fail with a scope/
 * insufficient-permission error, not the "Permission denied on resource
 * Space" error being tested for — that distinction is itself diagnostic.
 *
 * Usage: npx tsx scripts/spike-meet-cohost.ts you@gmail.com
 */

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    console.error("Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALENDAR_REFRESH_TOKEN in web/.env first.");
    process.exit(1);
  }
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function createSpace(auth: InstanceType<typeof google.auth.OAuth2>) {
  console.log("\n=== Step 1: spaces.create (with accessType set inline) ===");
  const meet = google.meet({ version: "v2", auth });
  try {
    const res = await meet.spaces.create({
      requestBody: { config: { accessType: "OPEN" } },
    });
    console.log("OK — space created:", JSON.stringify(res.data, null, 2));
    return res.data;
  } catch (error) {
    console.error("FAILED — spaces.create:", error instanceof Error ? error.message : error);
    throw error;
  }
}

async function addCohost(auth: InstanceType<typeof google.auth.OAuth2>, spaceName: string, email: string) {
  console.log(`\n=== Step 2: v2beta spaces.members (COHOST, raw HTTPS — no SDK support in v2) ===`);
  try {
    const res = await auth.request({
      url: `https://meet.googleapis.com/v2beta/${spaceName}/members`,
      method: "POST",
      data: { email, role: "COHOST" },
    });
    console.log("OK — member added:", JSON.stringify(res.data, null, 2));
    return res.data;
  } catch (error) {
    console.error("FAILED — v2beta spaces.members.create:", error instanceof Error ? error.message : error);
    throw error;
  }
}

async function linkCalendarEvent(auth: InstanceType<typeof google.auth.OAuth2>, spaceMeetingCode: string) {
  console.log("\n=== Step 3: calendar.events.insert linked to the pre-created space (conferenceData.conferenceId) ===");
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";
  const calendar = google.calendar({ version: "v3", auth });
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  try {
    const res = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: "[SPIKE — 0c41063c co-host feasibility, safe to delete]",
        start: { dateTime: startsAt.toISOString() },
        end: { dateTime: endsAt.toISOString() },
        conferenceData: {
          conferenceId: spaceMeetingCode,
          conferenceSolution: { key: { type: "hangoutsMeet" } },
        },
      },
    });
    console.log("OK — event created:", res.data.htmlLink, "hangoutLink:", res.data.hangoutLink);
    return { calendar, calendarId, eventId: res.data.id };
  } catch (error) {
    console.error("FAILED — calendar.events.insert (conferenceId link):", error instanceof Error ? error.message : error);
    throw error;
  }
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/spike-meet-cohost.ts <email-to-add-as-cohost>");
    process.exit(1);
  }

  const auth = getOAuthClient();
  const results: Record<string, "ok" | "failed" | "skipped"> = {
    spacesCreate: "skipped",
    membersCreate: "skipped",
    calendarLink: "skipped",
  };
  let cleanupEvent: { calendar: ReturnType<typeof google.calendar>; calendarId: string; eventId?: string | null } | null = null;

  try {
    const space = await createSpace(auth);
    results.spacesCreate = "ok";

    if (space.name) {
      try {
        await addCohost(auth, space.name, email);
        results.membersCreate = "ok";
      } catch {
        results.membersCreate = "failed";
      }
    }

    if (space.meetingCode) {
      try {
        cleanupEvent = await linkCalendarEvent(auth, space.meetingCode);
        results.calendarLink = "ok";
      } catch {
        results.calendarLink = "failed";
      }
    }
  } catch {
    results.spacesCreate = "failed";
  } finally {
    if (cleanupEvent?.eventId) {
      await cleanupEvent.calendar.events
        .delete({ calendarId: cleanupEvent.calendarId, eventId: cleanupEvent.eventId })
        .then(() => console.log("\nCleaned up the spike Calendar event."))
        .catch((error) => console.error("\nCould not clean up the spike Calendar event:", error));
    }
  }

  console.log("\n=== Summary ===");
  console.log(results);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Spike failed:", error);
    process.exit(1);
  });
