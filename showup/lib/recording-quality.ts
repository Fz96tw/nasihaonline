/**
 * Recording quality presets. The host picks one in Fine-tune; the id travels with the Start request and the server maps
 * it to encoder settings here. Raw numbers are never accepted from the client, so a caller can't ask the recorder for
 * something it can't afford. LiveKit fixes encoding when an egress starts, so a change applies to the next Start.
 * Pure (no server-only or browser imports) so both sides and the tests can use it.
 */

export const RECORDING_QUALITY_IDS = ["compact", "standard", "sharp", "smooth"] as const;
export type RecordingQualityId = (typeof RECORDING_QUALITY_IDS)[number];

export type RecordingQuality = {
  id: RecordingQualityId;
  label: string;
  hint: string;
  width: number;
  height: number;
  framerate: number;
  /** kbps, as EncodingOptions.videoBitrate expects. */
  videoBitrate: number;
};

export const DEFAULT_RECORDING_QUALITY: RecordingQualityId = "standard";

export const RECORDING_QUALITIES: Record<RecordingQualityId, RecordingQuality> = {
  compact: { id: "compact", label: "Compact", hint: "720p · 15 fps · 1.2 Mbps — smallest files", width: 1280, height: 720, framerate: 15, videoBitrate: 1200 },
  standard: { id: "standard", label: "Standard", hint: "720p · 20 fps · 2 Mbps — the current default", width: 1280, height: 720, framerate: 20, videoBitrate: 2000 },
  sharp: { id: "sharp", label: "Sharp text", hint: "1080p · 15 fps · 4 Mbps — best for slides and documents", width: 1920, height: 1080, framerate: 15, videoBitrate: 4000 },
  smooth: { id: "smooth", label: "Sharp + smooth", hint: "1080p · 30 fps · 6 Mbps — for demos with motion; heaviest on the server", width: 1920, height: 1080, framerate: 30, videoBitrate: 6000 },
};

export function parseRecordingQuality(value: unknown): RecordingQualityId {
  return typeof value === "string" && (RECORDING_QUALITY_IDS as readonly string[]).includes(value) ? (value as RecordingQualityId) : DEFAULT_RECORDING_QUALITY;
}

const STORAGE_KEY = "showup:recording-quality";

/** The host's remembered choice (best effort: storage may be unavailable). */
export function loadRecordingQuality(): RecordingQualityId {
  try {
    return parseRecordingQuality(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_RECORDING_QUALITY;
  }
}

export function saveRecordingQuality(id: RecordingQualityId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Not remembered; the choice still applies until reload.
  }
}
