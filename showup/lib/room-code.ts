import { createHash } from "node:crypto";

/** Minimum/maximum length of a normalized meeting code. Short codes are guessable, so the floor matters. */
export const CODE_MIN_LENGTH = 6;
export const CODE_MAX_LENGTH = 64;

/** Prefix that namespaces Showup rooms on the shared LiveKit instance away from Nasiha's rooms. */
export const ROOM_PREFIX = "showup-";

/** Trim, collapse inner whitespace and case-fold, so "  My Code " and "my code" are the same meeting. */
export function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * LiveKit room name for a code. The code itself is never used as the room name:
 * room names show up in webhooks, logs and the LiveKit dashboard, and the code
 * is effectively the meeting's only secret.
 */
export function roomNameForCode(code: string): string {
  return `${ROOM_PREFIX}${codeDigest(code)}`;
}

/** Stable, non-reversible id for a code. It's the suffix of the LiveKit room name, so a webhook (which only knows the room name) can find the code's Redis state without the raw code. */
export function codeDigest(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex").slice(0, 32);
}

/** Inverse of `roomNameForCode`'s naming: the digest for a Showup room name, or null for anyone else's room on the shared LiveKit. */
export function digestFromRoomName(roomName: string): string | null {
  if (!roomName.startsWith(ROOM_PREFIX)) return null;
  const digest = roomName.slice(ROOM_PREFIX.length);
  return /^[0-9a-f]{32}$/.test(digest) ? digest : null;
}
