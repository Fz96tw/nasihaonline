import "dotenv/config";
import { google } from "googleapis";
import { db } from "@/lib/db";
import { MeetingRequestStatus } from "@/lib/generated/prisma/enums";

/**
 * One-off re-patch for every already-scheduled Event/MeetingRequest Meet
 * link whose accessType: OPEN patch (web/lib/google-calendar.ts) ran before
 * the Workspace Meet safety setting for this domain was changed to allow
 * "Open" (2026-08-22) — those spaces are stuck with whatever accessType
 * resulted from that earlier, more-restrictive domain policy, and won't
 * pick up the policy change on their own. Scoped to future, still-joinable
 * meetings only, not a blanket historical sweep.
 *
 * Duplicates (rather than imports) lib/google-calendar.ts's OAuth setup —
 * that module starts with `import "server-only"`, which unconditionally
 * throws outside Next.js's build.
 *
 *   npx tsx scripts/reopen-meet-lobbies.ts
 */
async function reopenLobby(meetingUrl: string): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Calendar isn't configured (missing GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN)");
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const meetingCode = meetingUrl.split("/").pop();
  const meet = google.meet({ version: "v2", auth });
  await meet.spaces.patch({
    name: `spaces/${meetingCode}`,
    updateMask: "config.accessType",
    requestBody: { config: { accessType: "OPEN" } },
  });
}

async function main() {
  const now = new Date();

  const events = await db.event.findMany({
    where: { meetingUrl: { startsWith: "https://meet.google.com/" }, cancelledAt: null, startsAt: { gte: now } },
    select: { id: true, title: true, meetingUrl: true },
  });
  const meetingRequests = await db.meetingRequest.findMany({
    where: {
      meetingUrl: { startsWith: "https://meet.google.com/" },
      scheduledAt: { gte: now },
      status: {
        in: [
          MeetingRequestStatus.accepted,
          MeetingRequestStatus.reschedule_by_sender,
          MeetingRequestStatus.reschedule_by_recipient,
        ],
      },
    },
    select: { id: true, topic: true, meetingUrl: true },
  });

  console.log(`Found ${events.length} upcoming event(s) and ${meetingRequests.length} upcoming meeting request(s).`);

  let succeeded = 0;
  let failed = 0;

  for (const event of events) {
    try {
      await reopenLobby(event.meetingUrl!);
      console.log(`Event ${event.id} ("${event.title}"): reopened.`);
      succeeded++;
    } catch (error) {
      console.error(`Event ${event.id} ("${event.title}"): failed to reopen —`, error);
      failed++;
    }
  }

  for (const meetingRequest of meetingRequests) {
    try {
      await reopenLobby(meetingRequest.meetingUrl!);
      console.log(`MeetingRequest ${meetingRequest.id} ("${meetingRequest.topic}"): reopened.`);
      succeeded++;
    } catch (error) {
      console.error(`MeetingRequest ${meetingRequest.id} ("${meetingRequest.topic}"): failed to reopen —`, error);
      failed++;
    }
  }

  console.log(`Done: ${succeeded} reopened, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error("Reopen sweep failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
