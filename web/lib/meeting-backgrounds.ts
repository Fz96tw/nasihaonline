/**
 * Webcam background choices for Nasiha Conference (LiveKit) meetings —
 * the pure, browser-API-free half of BackgroundControl
 * (components/calendar/background-control.tsx), kept separate so it can be
 * unit-tested under `node --test`.
 *
 * Everything here is per-viewer and lives only in the participant's own
 * browser: the choice and (for "custom") the downscaled image are stored in
 * localStorage, and the image is never uploaded to our server — only the
 * processed camera video leaves the device. That's what lets external
 * guests (no account) use it exactly like members.
 */

export type MeetingBackgroundPreset = { id: string; label: string; src: string; thumb: string };

export const MEETING_BACKGROUND_PRESETS: readonly MeetingBackgroundPreset[] = [
  { id: "library", label: "Library", src: "/images/meeting-backgrounds/library.jpg", thumb: "/images/meeting-backgrounds/library-thumb.jpg" },
  { id: "bookshelves", label: "Bookshelves", src: "/images/meeting-backgrounds/bookshelves.jpg", thumb: "/images/meeting-backgrounds/bookshelves-thumb.jpg" },
  { id: "lighthouse", label: "Lighthouse", src: "/images/meeting-backgrounds/lighthouse.jpg", thumb: "/images/meeting-backgrounds/lighthouse-thumb.jpg" },
  { id: "meadow", label: "Meadow", src: "/images/meeting-backgrounds/meadow.jpg", thumb: "/images/meeting-backgrounds/meadow-thumb.jpg" },
];

export type MeetingBackgroundChoice =
  | { kind: "none" }
  | { kind: "blur" }
  | { kind: "preset"; id: string }
  | { kind: "custom" };

export const NO_BACKGROUND: MeetingBackgroundChoice = { kind: "none" };

export const BACKGROUND_CHOICE_STORAGE_KEY = "nasiha.meeting.background";
export const CUSTOM_BACKGROUND_STORAGE_KEY = "nasiha.meeting.background.custom";

/** Checked against the file as picked, before it's downscaled. */
export const CUSTOM_BACKGROUND_MAX_BYTES = 10 * 1024 * 1024;
export const CUSTOM_BACKGROUND_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];
/** Longest edge of the stored/used custom image — the camera itself is capped at 480p, so more is wasted. */
export const CUSTOM_BACKGROUND_MAX_EDGE = 1280;

/**
 * Reads back what `serializeBackgroundChoice` stored. Anything unrecognized —
 * including an unknown preset id or a "custom" choice whose image is no
 * longer stored — falls back to no background (effects are opt-in).
 */
export function parseBackgroundChoice(raw: string | null, hasCustomImage: boolean): MeetingBackgroundChoice {
  if (!raw) return NO_BACKGROUND;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return NO_BACKGROUND;
  }
  if (!value || typeof value !== "object") return NO_BACKGROUND;
  const { kind, id } = value as { kind?: unknown; id?: unknown };
  if (kind === "blur") return { kind: "blur" };
  if (kind === "custom") return hasCustomImage ? { kind: "custom" } : NO_BACKGROUND;
  if (kind === "preset" && typeof id === "string" && findPreset(id)) return { kind: "preset", id };
  return NO_BACKGROUND;
}

export function serializeBackgroundChoice(choice: MeetingBackgroundChoice): string {
  return JSON.stringify(choice);
}

export function findPreset(id: string): MeetingBackgroundPreset | undefined {
  return MEETING_BACKGROUND_PRESETS.find((preset) => preset.id === id);
}

export function sameBackgroundChoice(a: MeetingBackgroundChoice, b: MeetingBackgroundChoice): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "preset" || a.id === (b as { id: string }).id;
}

/** A friendly reason the picked file can't be used, or null if it's fine to try decoding. */
export function validateCustomBackgroundFile(file: { type: string; size: number }): string | null {
  if (!CUSTOM_BACKGROUND_TYPES.includes(file.type)) return "Please choose a JPEG, PNG or WebP image.";
  if (file.size > CUSTOM_BACKGROUND_MAX_BYTES) return "That image is too large. Please choose one under 10 MB.";
  return null;
}

/** Size to draw a width×height image at so its longest edge is at most maxEdge (never upscales). */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
