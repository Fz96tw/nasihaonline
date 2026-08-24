import "server-only";
import { RoomServiceClient } from "livekit-server-sdk";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import { sendCalendarIntegrationAlertEmail } from "@/lib/email";

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

function getRoomServiceClient(): RoomServiceClient | null {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  // RoomServiceClient talks to LiveKit's HTTP twirp API, not the wss://
  // signaling endpoint the browser client connects to — same host, different scheme.
  return new RoomServiceClient(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

/**
 * Same alert mechanism as google-calendar.ts's notifyAdminsOfMeetLinkFailure
 * (reuses sendCalendarIntegrationAlertEmail directly rather than importing
 * that function, since its wording is Google/Meet-specific and would be
 * misleading for a LiveKit failure) — surfaces a room-creation failure to
 * every admin within minutes rather than it only being discovered when a
 * member notices a missing meeting link. Best-effort: must never throw.
 */
async function notifyAdminsOfLiveKitFailure(topic: string, error: unknown): Promise<void> {
  try {
    const admins = await db.user.findMany({ where: { role: Role.admin }, select: { email: true, name: true } });
    const errorMessage = error instanceof Error ? error.message : String(error);
    await sendCalendarIntegrationAlertEmail(admins, { topic: `${topic} (LiveKit room create)`, errorMessage });
  } catch (alertError) {
    console.error("[livekit] Failed to notify admins of room creation failure", alertError);
  }
}

/**
 * Creates a LiveKit room for an event/meeting, non-fatal on failure — same
 * philosophy as createMeetingCalendarEvent(): unconfigured or failing
 * LiveKit credentials must never block event/meeting creation, since the
 * Event/MeetingRequest row is the source of truth. Returns null instead of
 * throwing.
 *
 * `roomName` is the caller's chosen unique identifier (the Event's
 * pre-generated id, or an existing MeetingRequest's id — see
 * events-server.ts/meeting-requests-server.ts) rather than a LiveKit-
 * generated one, so the DB row and the LiveKit room can be created/looked
 * up independently without an extra round-trip to learn the name.
 *
 * Egress (recording) isn't configured here — deferred to objective 4
 * pending a storage-destination decision (MinIO vs. a dedicated cloud
 * account). This only creates the bare room.
 */
export async function createLiveKitRoom(roomName: string, topic: string): Promise<string | null> {
  const roomService = getRoomServiceClient();
  if (!roomService) {
    console.warn("[livekit] LiveKit isn't configured — skipping room creation");
    return null;
  }

  try {
    const room = await roomService.createRoom({ name: roomName });
    return room.name;
  } catch (error) {
    console.error("[livekit] Failed to create room", error);
    await notifyAdminsOfLiveKitFailure(topic, error);
    return null;
  }
}
