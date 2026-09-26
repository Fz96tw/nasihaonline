/** Client-side helpers shared by the room, the exit screen and the landing page (no server-only imports). */
import { SAVED_RECORDINGS_KEY, type SavedRecording } from "@/lib/room-types";

export type RecordingViewJson = {
  recId: string;
  status: "none" | "processing" | "ready" | "failed";
  createdAt: number;
  expiresAt: number;
  parts: { index: number; durationSeconds: number | null; sizeBytes: number | null; url: string | null }[];
  error: string | null;
  emailAvailable?: boolean;
  emailQueued?: boolean;
};

/** Recordings are deleted server-side 24 hours after creation (RECORDING_TTL_SECONDS), so older links are dead. */
const SAVED_RECORDING_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function readSavedRecordings(): SavedRecording[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_RECORDINGS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? (parsed as SavedRecording[]).filter((r) => Date.now() - r.savedAt < SAVED_RECORDING_LIFETIME_MS)
      : [];
  } catch {
    return [];
  }
}

/**
 * Remembers a recording's recovery link on this device (newest first, capped). Re-saving an entry keeps its
 * original savedAt (so revisiting never extends the 24-hour life), its downloaded mark, and any known code.
 */
export function saveRecording(entry: Omit<SavedRecording, "savedAt" | "downloadedAt">) {
  try {
    const all = readSavedRecordings();
    const existing = all.find((r) => r.recId === entry.recId);
    const merged: SavedRecording = {
      ...existing,
      ...entry,
      code: entry.code || existing?.code || "",
      savedAt: existing?.savedAt ?? Date.now(),
    };
    localStorage.setItem(SAVED_RECORDINGS_KEY, JSON.stringify([merged, ...all.filter((r) => r.recId !== entry.recId)].slice(0, 20)));
  } catch {
    // Storage unavailable: the link on screen (and the passcode) still work.
  }
}

/** Marks a saved recording as downloaded on this device. No-op if it isn't saved here (e.g. opened via /recover). */
export function markRecordingDownloaded(recId: string) {
  try {
    const all = readSavedRecordings();
    if (!all.some((r) => r.recId === recId)) return;
    localStorage.setItem(
      SAVED_RECORDINGS_KEY,
      JSON.stringify(all.map((r) => (r.recId === recId ? { ...r, downloadedAt: Date.now() } : r))),
    );
  } catch {
    // Storage unavailable: the mark just isn't remembered.
  }
}

export function recordingLink(recId: string, hostSecret: string): string {
  return `/recording/${recId}#${hostSecret}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
