/**
 * Emoji reactions in a Nasiha Conference meeting: momentary, fire-and-forget
 * messages over a LiveKit data channel (unlike a raised hand, which is state —
 * see components/calendar/raise-hand.tsx). The sender is never named in the
 * payload; receivers read it from LiveKit's own participant argument so a
 * reaction can't be passed off as someone else's. Parsing is strict: anything
 * that isn't exactly one allowed emoji is ignored.
 */

export const REACTION_TOPIC = "nasiha-reaction";

/** The tray, in display order (4x4). `label` is the tooltip and accessible name. */
export const REACTIONS = [
  { emoji: "👍", label: "Agree" },
  { emoji: "👎", label: "Disagree" },
  { emoji: "❤️", label: "Love" },
  { emoji: "👏", label: "Applause" },
  { emoji: "😊", label: "Smile" },
  { emoji: "😍", label: "Love it" },
  { emoji: "😂", label: "Funny" },
  { emoji: "😅", label: "Phew" },
  { emoji: "😮", label: "Surprised" },
  { emoji: "😎", label: "Cool" },
  { emoji: "🎉", label: "Celebrate" },
  { emoji: "🙏", label: "Thank you" },
  { emoji: "💡", label: "Great idea" },
  { emoji: "🤔", label: "Thinking" },
  { emoji: "💯", label: "Spot on" },
  { emoji: "🔥", label: "Fire" },
] as const;

/** A sender may send, and a receiver will show, at most one reaction per sender in this window. */
export const REACTION_MIN_INTERVAL_MS = 900;
/** How long a reaction floats before it's removed (matches the CSS animation). */
export const REACTION_FLOAT_MS = 3_000;
/** Most reactions on screen at once; extras are dropped rather than queued. */
export const MAX_FLOATING_REACTIONS = 15;
/** Emoji size on the floating overlay (Tailwind classes) — desktop / phone. */
export const REACTION_EMOJI_SIZE_CLASS = "text-5xl max-sm:text-4xl";
/** Longest name shown under a floating emoji before it's cut with an ellipsis. */
export const REACTION_NAME_MAX_CHARS = 12;

const MAX_MESSAGE_BYTES = 64;
const ALLOWED = new Set<string>(REACTIONS.map((r) => r.emoji));

export function encodeReaction(emoji: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify({ t: "reaction", emoji }));
}

/** Returns the emoji if `payload` is exactly one well-formed reaction from the allowed set, otherwise null. */
export function parseReaction(payload: Uint8Array): string | null {
  if (payload.byteLength > MAX_MESSAGE_BYTES) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const message = value as Record<string, unknown>;
    return message.t === "reaction" && typeof message.emoji === "string" && ALLOWED.has(message.emoji) ? message.emoji : null;
  } catch {
    return null;
  }
}
