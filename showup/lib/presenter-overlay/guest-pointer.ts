/**
 * Guest laser pointer (Showup 14): the pure, clock-free logic.
 * A guest's browser finds their own pointing finger and sends only its position in their camera frame (0-1) plus an
 * on/off flag; the presenter's browser checks who may point and draws the dot on that guest's ghost. Time is passed in,
 * like speaker-follow.ts. Parsing is strict: anything that isn't exactly one of these shapes is ignored.
 */
import { cameraToOutput, type GhostPlacement } from "./gestures.ts";

export const POINTER_TOPIC = "showup-pointer";

/** Host setting "Guests can point". */
export type PointerPolicy = "off" | "ask" | "on";

/**
 * What a guest is told about their own pointer:
 * - off: can't point now (policy off, revoked, or their ghost isn't on the share)
 * - ask: may ask to use it (policy "Ask me")
 * - pending: asked, waiting for the presenter
 * - allowed: may point now
 */
export type PointerStatus = "off" | "ask" | "pending" | "allowed";

/** A fingertip position (or "pointing ended" when `on` is false), in the guest's camera frame. */
export type PointerPosition = { t: "pointer"; u: number; v: number; on: boolean };

/** Guest -> presenter. */
export type PointerToHost = { t: "pointer-request" } | PointerPosition;

/** Presenter -> guest. */
export type PointerToGuest = { t: "pointer-status"; status: PointerStatus };

const STATUSES: readonly PointerStatus[] = ["off", "ask", "pending", "allowed"];
const MAX_MESSAGE_BYTES = 128;

/** A guest sends about this often while pointing (~13 a second). */
export const POINTER_SEND_INTERVAL_MS = 75;
/** The host accepts at most one position per guest this often (about 33 a second); more is ignored. */
export const POINTER_MIN_INTERVAL_MS = 30;
/** A dot stays this long after the last "active" message, then is gone. */
export const POINTER_TIMEOUT_MS = 500;
/** The last part of that time the dot fades out. */
export const POINTER_FADE_MS = 200;
/** An unanswered request lapses after this long. */
export const POINTER_REQUEST_TIMEOUT_MS = 30_000;
/** Time constant of the smoothing that bridges the gaps between ~13 a second positions. */
const DOT_SMOOTH_MS = 70;

/** Per-guest dot colours, none of them the host's red laser or pen. Handed out in the order guests first point. */
export const GUEST_POINTER_COLORS: readonly string[] = ["#22d3ee", "#a3e635", "#facc15", "#e879f9", "#fb923c", "#60a5fa"];

export function encodePointerMessage(message: PointerToHost | PointerToGuest): Uint8Array<ArrayBuffer> {
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

const inRange = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

export function parsePointerToHost(payload: Uint8Array): PointerToHost | null {
  const message = parseJson(payload);
  if (!message) return null;
  if (message.t === "pointer-request") return { t: "pointer-request" };
  if (message.t === "pointer" && inRange(message.u) && inRange(message.v) && typeof message.on === "boolean") {
    return { t: "pointer", u: message.u, v: message.v, on: message.on };
  }
  return null;
}

export function parsePointerToGuest(payload: Uint8Array): PointerToGuest | null {
  const message = parseJson(payload);
  if (!message) return null;
  if (message.t === "pointer-status" && STATUSES.includes(message.status as PointerStatus)) {
    return { t: "pointer-status", status: message.status as PointerStatus };
  }
  return null;
}

/** A dot to draw: `u`/`v` are the guest's fingertip in their camera frame (0-1), `fade` is 1 while pointing and falls to 0 as it times out. */
export type GuestPointerDot = { id: string; u: number; v: number; fade: number; color: string };

type Live = { u: number; v: number; lastAt: number; dispU: number; dispV: number; dispAt: number };

/**
 * Who may point, and where each pointing guest's dot is. The caller says which guests' ghosts are on the share
 * (`visible`) at each call, so a guest whose ghost isn't shown can never get a dot however they got a permission.
 */
export class GuestPointerBoard {
  policy: PointerPolicy = "off";
  private approved = new Set<string>();
  private blocked = new Set<string>();
  private requests = new Map<string, number>();
  private live = new Map<string, Live>();
  private lastAccepted = new Map<string, number>();
  private colors = new Map<string, string>();

  /** What this guest should be told about their pointer right now. */
  status(id: string, visible: boolean): PointerStatus {
    if (!visible || this.policy === "off" || this.blocked.has(id)) return "off";
    if (this.policy === "on" || this.approved.has(id)) return "allowed";
    return this.requests.has(id) ? "pending" : "ask";
  }

  canPoint(id: string, visible: boolean): boolean {
    return this.status(id, visible) === "allowed";
  }

  /** Guests waiting for the presenter to answer. */
  get requesting(): string[] {
    return Array.from(this.requests.keys());
  }

  isBlocked(id: string): boolean {
    return this.blocked.has(id);
  }

  /** Whether the policy and the host's choices would let this guest point if their ghost were on the share. */
  permitted(id: string): boolean {
    return this.policy !== "off" && !this.blocked.has(id) && (this.policy === "on" || this.approved.has(id));
  }

  /** The colour this guest's dot has (from their first point), if they have pointed. */
  colorOf(id: string): string | undefined {
    return this.colors.get(id);
  }

  /** A guest asks to use the pointer. Only counts under "Ask me", while their ghost is on the share and they aren't revoked. */
  request(id: string, visible: boolean, now: number): PointerStatus {
    if (this.status(id, visible) === "ask") this.requests.set(id, now + POINTER_REQUEST_TIMEOUT_MS);
    return this.status(id, visible);
  }

  /** The presenter's answer to a request. */
  decide(id: string, allow: boolean) {
    if (!this.requests.delete(id)) return;
    if (allow) this.approved.add(id);
  }

  /** Lets a guest point (an approval under "Ask me", or lifting a revoke under "On"). */
  allow(id: string) {
    this.blocked.delete(id);
    this.requests.delete(id);
    this.approved.add(id);
  }

  /** Takes a guest's pointer away at once, whatever the policy; their dot goes with it. */
  revoke(id: string) {
    this.approved.delete(id);
    this.requests.delete(id);
    this.blocked.add(id);
    this.live.delete(id);
  }

  /** Requests that have lapsed. */
  expire(now: number): string[] {
    const lapsed: string[] = [];
    this.requests.forEach((until, id) => {
      if (now >= until) lapsed.push(id);
    });
    for (const id of lapsed) this.requests.delete(id);
    return lapsed;
  }

  /**
   * A position from a guest. Ignored (false) unless the guest is allowed to point and their ghost is on the share,
   * and it isn't arriving faster than POINTER_MIN_INTERVAL_MS. An "off" message just ends their dot.
   */
  accept(id: string, message: { u: number; v: number; on: boolean }, visible: boolean, now: number): boolean {
    if (!message.on) {
      this.live.delete(id);
      return true;
    }
    if (!this.canPoint(id, visible)) return false;
    if (!inRange(message.u) || !inRange(message.v)) return false;
    const previous = this.lastAccepted.get(id);
    if (previous !== undefined && now - previous < POINTER_MIN_INTERVAL_MS) return false;
    this.lastAccepted.set(id, now);
    if (!this.colors.has(id)) this.colors.set(id, GUEST_POINTER_COLORS[this.colors.size % GUEST_POINTER_COLORS.length]);
    const live = this.live.get(id);
    if (live && now - live.lastAt <= POINTER_TIMEOUT_MS) {
      live.u = message.u;
      live.v = message.v;
      live.lastAt = now;
    } else {
      this.live.set(id, { u: message.u, v: message.v, lastAt: now, dispU: message.u, dispV: message.v, dispAt: now });
    }
    return true;
  }

  /** Dots to draw now, smoothed. A guest whose ghost isn't on the share, or who lost permission, has none. */
  dots(now: number, visibleIds: readonly string[]): GuestPointerDot[] {
    const dots: GuestPointerDot[] = [];
    this.live.forEach((live, id) => {
      const age = now - live.lastAt;
      if (age > POINTER_TIMEOUT_MS || !visibleIds.includes(id) || !this.canPoint(id, true)) {
        this.live.delete(id);
        return;
      }
      const k = 1 - Math.exp(-Math.max(0, now - live.dispAt) / DOT_SMOOTH_MS);
      live.dispU += (live.u - live.dispU) * k;
      live.dispV += (live.v - live.dispV) * k;
      live.dispAt = now;
      const fade = age <= POINTER_TIMEOUT_MS - POINTER_FADE_MS ? 1 : (POINTER_TIMEOUT_MS - age) / POINTER_FADE_MS;
      dots.push({ id, u: live.dispU, v: live.dispV, fade: Math.max(0, Math.min(1, fade)), color: this.colors.get(id) ?? GUEST_POINTER_COLORS[0] });
    });
    return dots;
  }

  /** Whether this guest has a dot up now. */
  isPointing(id: string, now: number): boolean {
    const live = this.live.get(id);
    return !!live && now - live.lastAt <= POINTER_TIMEOUT_MS;
  }

  /** Forgets guests who have left the meeting. */
  prune(presentIds: ReadonlySet<string>) {
    for (const map of [this.requests, this.live, this.lastAccepted]) {
      for (const id of Array.from(map.keys())) if (!presentIds.has(id)) map.delete(id);
    }
    for (const set of [this.approved, this.blocked]) {
      for (const id of Array.from(set)) if (!presentIds.has(id)) set.delete(id);
    }
  }

  /** Everything is over (overlay off, or the share ended): no dots, no pending requests. Approvals and revokes are kept for the session. */
  clearLive() {
    this.live.clear();
    this.requests.clear();
  }
}

/**
 * Guest side: turns "where is my fingertip now" (or nothing) into the messages to send. At most one position every
 * POINTER_SEND_INTERVAL_MS, and exactly one "off" when the pointing ends.
 */
export class PointerSender {
  private active = false;
  private lastAt = Number.NEGATIVE_INFINITY;

  next(now: number, tip: { u: number; v: number } | null): PointerPosition | null {
    if (tip) {
      if (now - this.lastAt < POINTER_SEND_INTERVAL_MS) return null;
      this.lastAt = now;
      this.active = true;
      const clamp = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
      return { t: "pointer", u: clamp(tip.u), v: clamp(tip.v), on: true };
    }
    if (!this.active) return null;
    this.active = false;
    this.lastAt = Number.NEGATIVE_INFINITY;
    return { t: "pointer", u: 0, v: 0, on: false };
  }
}

/**
 * Where a guest's fingertip lands on the shared screen: through that guest's ghost (placement, size and the host's
 * single mirror rule), so the dot sits on the ghost's own fingertip. Guests are always cut-outs, never a cropped panel.
 */
export function mapGuestPointer(u: number, v: number, ghost: Omit<GhostPlacement, "crop">): { x: number; y: number } {
  return cameraToOutput(u, v, { ...ghost, crop: null });
}
