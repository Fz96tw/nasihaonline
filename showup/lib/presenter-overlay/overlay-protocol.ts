/**
 * Data messages between the presenter (who runs the overlay) and guests who
 * want to, or are asked to, appear on it. Sent over LiveKit data channels on
 * OVERLAY_TOPIC, always addressed to one participant. Parsing is strict:
 * anything that isn't exactly one of these shapes is ignored.
 */
import type { GuestOverlayState } from "./co-ghosts.ts";

export const OVERLAY_TOPIC = "showup-overlay";

/** Guest -> presenter. */
export type ToPresenter = { t: "overlay-join-request" } | { t: "overlay-response"; accept: boolean } | { t: "overlay-leave" };

/** Presenter -> guest. */
export type ToGuest =
  | { t: "overlay-request" }
  | { t: "overlay-state"; state: GuestOverlayState }
  /** Everyone whose camera is currently on the overlay, sent to every participant so each hides those camera tiles. */
  | { t: "overlay-roster"; ids: string[] };

const GUEST_STATES: readonly GuestOverlayState[] = ["on", "off", "pending", "full", "declined", "closed", "unavailable", "timeout"];
const MAX_MESSAGE_BYTES = 512;
const MAX_ROSTER_IDS = 4;
const MAX_ID_LENGTH = 100;

export function encodeMessage(message: ToPresenter | ToGuest): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(message));
}

function parseJson(payload: Uint8Array): Record<string, unknown> | null {
  if (payload.byteLength > MAX_MESSAGE_BYTES) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseToPresenter(payload: Uint8Array): ToPresenter | null {
  const message = parseJson(payload);
  if (!message) return null;
  if (message.t === "overlay-join-request") return { t: "overlay-join-request" };
  if (message.t === "overlay-leave") return { t: "overlay-leave" };
  if (message.t === "overlay-response" && typeof message.accept === "boolean") return { t: "overlay-response", accept: message.accept };
  return null;
}

export function parseToGuest(payload: Uint8Array): ToGuest | null {
  const message = parseJson(payload);
  if (!message) return null;
  if (message.t === "overlay-request") return { t: "overlay-request" };
  if (
    message.t === "overlay-roster" &&
    Array.isArray(message.ids) &&
    message.ids.length <= MAX_ROSTER_IDS &&
    message.ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH)
  ) {
    return { t: "overlay-roster", ids: message.ids as string[] };
  }
  if (message.t === "overlay-state" && GUEST_STATES.includes(message.state as GuestOverlayState)) {
    return { t: "overlay-state", state: message.state as GuestOverlayState };
  }
  return null;
}
