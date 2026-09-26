/**
 * Host reactions (Showup 20): the pure, clock-free lifecycle and placement of the emoji that pops up by the host's ghost.
 * One reaction at a time; it rises and fades out over about 2 seconds. Time is passed in.
 */

import type { GhostPlacement, ReactionKind } from "./gestures.ts";

export const REACTION_EMOJI: Record<ReactionKind, string> = { thumbsup: "👍", thumbsdown: "👎", wave: "👋" };

/** How long a reaction lasts, and how long it stays fully solid before fading. */
export const REACTION_MS = 2000;
export const REACTION_HOLD_MS = 500;
/** Size and rise, as fractions of the output frame height. */
export const REACTION_SIZE = 0.1;
export const REACTION_RISE = 0.15;

export type ReactionFrame = { kind: ReactionKind; alpha: number; /** 0 → 1 over the lifetime. */ progress: number };

export class ReactionPlayer {
  private current: { kind: ReactionKind; startedAt: number } | null = null;

  /** Shows a reaction now, replacing any that is still on screen (so only one is ever shown). */
  start(now: number, kind: ReactionKind) {
    this.current = { kind, startedAt: now };
  }

  clear() {
    this.current = null;
  }

  /** The reaction to draw at `now`, or null when there is none (or it has finished). */
  frame(now: number): ReactionFrame | null {
    if (!this.current) return null;
    const age = now - this.current.startedAt;
    if (age < 0) return null;
    if (age >= REACTION_MS) {
      this.current = null;
      return null;
    }
    const alpha = age <= REACTION_HOLD_MS ? 1 : 1 - (age - REACTION_HOLD_MS) / (REACTION_MS - REACTION_HOLD_MS);
    return { kind: this.current.kind, alpha, progress: age / REACTION_MS };
  }
}

/**
 * Where to draw a reaction, in output pixels: to the right of the middle of the host's ghost, starting near the top of it
 * (about where the head is) and floating up by REACTION_RISE of the frame height. Follows the ghost; kept fully on the frame.
 */
export function reactionPosition(ghost: Pick<GhostPlacement, "x" | "y" | "width" | "height">, frameWidth: number, frameHeight: number, progress: number): { x: number; y: number; size: number } {
  const size = frameHeight * REACTION_SIZE;
  const startY = ghost.y + ghost.height * 0.12;
  const x = Math.min(Math.max(ghost.x + ghost.width * 0.72, size), frameWidth - size);
  const y = Math.min(Math.max(startY - frameHeight * REACTION_RISE * progress, size), frameHeight - size);
  return { x, y, size };
}
