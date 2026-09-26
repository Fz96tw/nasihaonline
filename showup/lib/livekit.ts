import "server-only";
import { AccessToken, RoomServiceClient, WebhookReceiver } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

/** How long a join token (and so, in practice, a meeting) is valid. Also the ceiling for the Redis code claim. */
export const TOKEN_TTL_SECONDS = 3 * 60 * 60;

/** Participants per meeting, including the host. Enforced by LiveKit itself via `maxParticipants`. */
export const MAX_PARTICIPANTS = 10;

/** How long an empty room lingers before LiveKit closes it and fires `room_finished`, which frees the code. */
const EMPTY_TIMEOUT_SECONDS = 120;

/** Bounds every call to LiveKit so an unreachable server turns into a fast "unavailable", not a hung request. */
const LIVEKIT_REQUEST_TIMEOUT_MS = 3000;

export function getRoomServiceClient(): RoomServiceClient | null {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  // RoomServiceClient talks to LiveKit's HTTP twirp API, not the wss://
  // signaling endpoint the browser client connects to — same host, different scheme.
  return new RoomServiceClient(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    requestTimeout: LIVEKIT_REQUEST_TIMEOUT_MS,
  });
}

/** Role carried in the join token's metadata; the client reads it from `localParticipant.metadata` to show host-only UI. */
export type ParticipantRole = "host" | "guest";

export type LiveKitJoinCredentials = { token: string; serverUrl: string };

/**
 * Creates the LiveKit room up front so a joiner can tell "a host started this
 * code" from "nobody has". Returns false (never throws) so callers can answer
 * with a clean "unavailable" instead of a 500.
 */
export async function createLiveKitRoom(roomName: string): Promise<boolean> {
  const roomService = getRoomServiceClient();
  if (!roomService) {
    console.warn("[livekit] LiveKit isn't configured — skipping room creation");
    return false;
  }
  try {
    await roomService.createRoom({
      name: roomName,
      maxParticipants: MAX_PARTICIPANTS,
      emptyTimeout: EMPTY_TIMEOUT_SECONDS,
    });
    return true;
  } catch (error) {
    console.error("[livekit] Failed to create room", error);
    return false;
  }
}

/** Cheap reachability probe for /api/health. */
export async function pingLiveKit(): Promise<"up" | "down" | "not_configured"> {
  const roomService = getRoomServiceClient();
  if (!roomService) return "not_configured";
  try {
    await roomService.listRooms([]);
    return "up";
  } catch {
    return "down";
  }
}

export type LiveRoomStatus = { exists: boolean; numParticipants: number } | null;

/**
 * Looks the room up on LiveKit. `null` means LiveKit couldn't be reached or
 * isn't configured (distinct from "reachable, no such room"), so routes can
 * report an outage differently from a wrong code.
 */
export async function getLiveRoomStatus(roomName: string): Promise<LiveRoomStatus> {
  const roomService = getRoomServiceClient();
  if (!roomService) return null;
  try {
    const [room] = await roomService.listRooms([roomName]);
    return room ? { exists: true, numParticipants: room.numParticipants } : { exists: false, numParticipants: 0 };
  } catch (error) {
    console.error("[livekit] Failed to look up room", error);
    return null;
  }
}

/**
 * Mints a join token for one participant. The host gets `roomAdmin` (mute or
 * remove others via the server-side RoomServiceClient — the client SDK has no
 * such capability regardless of the grant) plus `role: "host"` metadata;
 * everyone else gets plain join/publish/subscribe. The API secret that signs
 * this JWT never leaves the server.
 */
export async function mintLiveKitToken(
  roomName: string,
  identity: string,
  name: string,
  role: ParticipantRole,
): Promise<LiveKitJoinCredentials | null> {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.warn("[livekit] LiveKit isn't configured — skipping token mint");
    return null;
  }
  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name,
      ttl: TOKEN_TTL_SECONDS,
      metadata: JSON.stringify({ role }),
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      ...(role === "host" ? { roomAdmin: true } : {}),
    });
    return { token: await token.toJwt(), serverUrl: LIVEKIT_URL };
  } catch (error) {
    console.error("[livekit] Failed to mint join token", error);
    return null;
  }
}

/**
 * Verifies and parses an incoming LiveKit webhook POST, using the same API
 * key/secret LiveKit signs with. Returns null on any verification/config
 * failure so the caller can answer 400 instead of throwing. `authHeader` must
 * come from the standard `Authorization` header (the SDK's own
 * `authorizeHeader` constant is "Authorize", which LiveKit does not send).
 */
export async function verifyLiveKitWebhook(rawBody: string, authHeader: string | null) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !authHeader) return null;
  try {
    const receiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    return await receiver.receive(rawBody, authHeader);
  } catch (error) {
    console.error("[livekit] Failed to verify webhook payload", error);
    return null;
  }
}

/**
 * Live room metadata shared with every connected client (LiveKit pushes
 * RoomEvent.RoomMetadataChanged for free). Used by later objectives
 * (recording state); kept here so those routes can merge into it.
 */
export type RoomMetadata = { recording: boolean; egressId: string | null };

/** Reads back the room's current metadata without trusting client input. */
export async function getRoomMetadata(roomName: string): Promise<RoomMetadata | null> {
  const roomService = getRoomServiceClient();
  if (!roomService) return null;
  try {
    const [room] = await roomService.listRooms([roomName]);
    if (!room?.metadata) return null;
    const parsed = JSON.parse(room.metadata) as Partial<RoomMetadata>;
    return { recording: parsed.recording === true, egressId: parsed.egressId ?? null };
  } catch (error) {
    console.error("[livekit] Failed to read room metadata", error);
    return null;
  }
}

/**
 * Merges `patch` into the room's current metadata rather than overwriting it,
 * so independent writers don't clobber each other's fields. Best-effort and
 * non-atomic (LiveKit has no compare-and-swap), which is fine for low-
 * frequency, host-triggered changes.
 */
export async function updateRoomMetadata(roomName: string, patch: Partial<RoomMetadata>): Promise<void> {
  const roomService = getRoomServiceClient();
  if (!roomService) return;
  try {
    const current = await getRoomMetadata(roomName);
    const next: RoomMetadata = {
      recording: current?.recording ?? false,
      egressId: current?.egressId ?? null,
      ...patch,
    };
    await roomService.updateRoomMetadata(roomName, JSON.stringify(next));
  } catch (error) {
    console.error("[livekit] Failed to update room metadata", error);
  }
}

/**
 * Force-disconnects one participant (host "kick" — the real server-side
 * primitive). Reports success/failure rather than swallowing it, since it is
 * a direct host action with its own UI feedback.
 */
export async function removeLiveKitParticipant(roomName: string, identity: string): Promise<boolean> {
  const roomService = getRoomServiceClient();
  if (!roomService) return false;
  try {
    await roomService.removeParticipant(roomName, identity);
    return true;
  } catch (error) {
    console.error("[livekit] Failed to remove participant", error);
    return false;
  }
}
