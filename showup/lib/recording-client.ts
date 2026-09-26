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

export function readSavedRecordings(): SavedRecording[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_RECORDINGS_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as SavedRecording[]) : [];
  } catch {
    return [];
  }
}

/** Remembers a recording's recovery link on this device (newest first, 24-hour expiry, capped). */
export function saveRecording(entry: Omit<SavedRecording, "savedAt">) {
  try {
    const day = 24 * 60 * 60 * 1000;
    const kept = readSavedRecordings().filter((r) => r.recId !== entry.recId && Date.now() - r.savedAt < day);
    localStorage.setItem(SAVED_RECORDINGS_KEY, JSON.stringify([{ ...entry, savedAt: Date.now() }, ...kept].slice(0, 20)));
  } catch {
    // Storage unavailable: the link on screen (and the passcode) still work.
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
