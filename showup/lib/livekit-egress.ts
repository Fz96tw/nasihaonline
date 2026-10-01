import "server-only";
import { EgressClient, EgressStatus, EncodedFileOutput, EncodedFileType, EncodingOptions, S3Upload } from "livekit-server-sdk";
import type { EgressInfo } from "livekit-server-sdk";
import { DEFAULT_RECORDING_QUALITY, RECORDING_QUALITIES, type RecordingQualityId } from "@/lib/recording-quality";
import { getEgressS3Config } from "@/lib/recordings-storage";

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const REQUEST_TIMEOUT_MS = 5000;

function getEgressClient(): EgressClient | null {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  // Egress's API is LiveKit's HTTP twirp endpoint, not the wss:// signalling URL.
  return new EgressClient(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    requestTimeout: REQUEST_TIMEOUT_MS,
  });
}

export type StartEgressResult = { egressId: string } | { error: string };

/**
 * Starts a room-composite recording (mp4) of the meeting into the recordings
 * bucket. LiveKit has no pause/resume on one egress, so each start is a new
 * file; the host's stop/start cycles become separate parts of one recording.
 */
export async function startEgress(roomName: string, quality: RecordingQualityId = DEFAULT_RECORDING_QUALITY): Promise<StartEgressResult> {
  const client = getEgressClient();
  if (!client) return { error: "Recording isn't configured." };
  const preset = RECORDING_QUALITIES[quality];
  const s3 = getEgressS3Config();
  if (!s3) return { error: "Recording storage isn't configured." };

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    // LiveKit fills in {time}/{room_id}; the real final key is read back from the egress result.
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

  try {
    const info = await client.startRoomCompositeEgress(roomName, output, {
      // Screen share as the large focus tile, participants in a small strip.
      layout: "speaker",
      // The host picks a preset in Fine-tune (default 720p/20fps/2 Mbps: shares are mostly static, so that stays legible).
      encodingOptions: new EncodingOptions({ width: preset.width, height: preset.height, framerate: preset.framerate, videoBitrate: preset.videoBitrate }),
    });
    if (info.status === EgressStatus.EGRESS_FAILED) return { error: info.error || "Egress failed to start." };
    return { egressId: info.egressId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** The finished file, if any, arrives via egress_ended (or a status poll), not this call. */
export async function stopEgress(egressId: string): Promise<boolean> {
  const client = getEgressClient();
  if (!client) return false;
  try {
    await client.stopEgress(egressId);
    return true;
  } catch (error) {
    console.error(`[livekit-egress] Failed to stop egress ${egressId}`, error);
    return false;
  }
}

/** Current state of one egress, for reconciling when the webhook hasn't arrived. Null if unreachable/unknown. */
export async function getEgressInfo(egressId: string): Promise<EgressInfo | null> {
  const client = getEgressClient();
  if (!client) return null;
  try {
    const [info] = await client.listEgress({ egressId });
    return info ?? null;
  } catch (error) {
    console.error(`[livekit-egress] Failed to read egress ${egressId}`, error);
    return null;
  }
}
