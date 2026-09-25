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
  const digest = createHash("sha256").update(normalizeCode(code)).digest("hex").slice(0, 32);
  return `${ROOM_PREFIX}${digest}`;
}
