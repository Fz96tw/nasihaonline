import "server-only";
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EgressStatus,
  EncodingOptions,
  S3Upload,
} from "livekit-server-sdk";
import { getRecordingsS3Config } from "@/lib/recordings-storage";

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

function getEgressClient(): EgressClient | null {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  // Same https:// rewrite as RoomServiceClient in lib/livekit.ts — EgressClient
  // also talks to LiveKit's HTTP twirp API, not the wss:// signaling endpoint.
  return new EgressClient(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

/**
 * Known LiveKit compositor bug (GitHub-documented, hit reproducibly during
 * the objective-1 spike against a completely empty room — no published
 * tracks yet): the composited output never receives its start signal and
 * the egress silently never produces output. This retry only catches the
 * failure when it surfaces synchronously from the start call itself (a
 * thrown error, or an immediately-failed EgressInfo) — now that recording
 * is user-initiated from inside an already-joined meeting (tracks are
 * almost always already published by the time someone clicks Record) this
 * is expected to be rare, kept as cheap insurance rather than a fully
 * general async-retry system.
 */
export const EMPTY_ROOM_ERROR_SIGNATURE = "start signal not received";

export type StartEgressResult = { egressId: string } | { error: string };

/**
 * Starts a new room-composite egress writing an mp4 segment to the
 * livekit-recordings MinIO bucket, keyed by roomName + a fresh id so
 * repeated start/stop cycles in the same meeting never collide (LiveKit's
 * egress API has no pause/resume on one egress — every start is a brand
 * new file, which is why recordings are stored as one row per segment, see
 * prisma/schema.prisma's EventRecording doc comment).
 */
export async function startEgress(roomName: string): Promise<StartEgressResult> {
  const egressClient = getEgressClient();
  if (!egressClient) return { error: "Recording isn't configured." };

  const s3 = getRecordingsS3Config();
  if (!s3) return { error: "Recording storage isn't configured." };

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    // LiveKit fills in {room_name}/{time} itself; the actual final key is
    // read back from EgressInfo.fileResults[0].filename by the egress_ended
    // webhook handler rather than reconstructed here, since LiveKit may
    // adjust it (e.g. de-duplicating a collision).
    filepath: `${roomName}/{time}-{room_id}.mp4`,
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: s3.accessKey,
        secret: s3.secret,
        bucket: s3.bucket,
        endpoint: s3.endpoint,
        forcePathStyle: s3.forcePathStyle,
        region: s3.region,
      }),
    },
  });

  async function attempt(): Promise<StartEgressResult> {
    try {
      const info = await egressClient!.startRoomCompositeEgress(roomName, output, {
        // Match the live meeting's VideoConference layout (screen share as the
        // large focus tile, other participants in a small sidebar strip)
        // instead of LiveKit's default "grid" template's equally-sized cells.
        layout: "speaker",
        // Resolution stays at LiveKit's 720p default deliberately — this is
        // a composite frame containing the screen share, so shrinking it
        // would blur shared text/slides/code, not just the webcam strip.
        // Framerate/bitrate are trimmed instead: screen shares are mostly
        // static content, so 20fps costs nothing visually while still
        // cutting real encode load (~3Mbps default -> 2Mbps).
        encodingOptions: new EncodingOptions({ width: 1280, height: 720, framerate: 20, videoBitrate: 2000 }),
      });
      if (info.status === EgressStatus.EGRESS_FAILED) {
        return { error: info.error || "Egress failed to start." };
      }
      return { egressId: info.egressId };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  const first = await attempt();
  if ("egressId" in first) return first;

  const isKnownCompositorBug = first.error.toLowerCase().includes(EMPTY_ROOM_ERROR_SIGNATURE);
  console.warn(
    `[livekit-egress] Start failed for room ${roomName}${isKnownCompositorBug ? " (known empty-room compositor bug)" : ""}, retrying once: ${first.error}`,
  );
  return attempt();
}

/** Stops an in-progress egress — the resulting file, if any, arrives via the egress_ended webhook, not this call's return value. */
export async function stopEgress(egressId: string): Promise<boolean> {
  const egressClient = getEgressClient();
  if (!egressClient) return false;
  try {
    await egressClient.stopEgress(egressId);
    return true;
  } catch (error) {
    console.error(`[livekit-egress] Failed to stop egress ${egressId}`, error);
    return false;
  }
}
