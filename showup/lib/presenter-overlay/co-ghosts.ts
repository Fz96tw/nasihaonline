/**
 * Who besides the presenter appears on the overlay ("co-ghosts"), and how
 * they got there. Pure and clock-free (callers pass `now`) so the rules can be
 * tested without a room.
 *
 * - The overlay holds at most MAX_GHOSTS people including the presenter, so at
 *   most MAX_GUEST_GHOSTS guests, shown in the order they were added.
 * - Someone becomes a co-ghost only by consent: either the presenter invites
 *   them and they Allow, or they ask and the presenter's policy admits them
 *   ("ask" waits for the presenter to Allow, "anyone" admits at once, "off"
 *   refuses).
 * - Pending invites/requests lapse after REQUEST_TIMEOUT_MS.
 * - A co-ghost drops when they leave or their camera stays off for
 *   GONE_GRACE_MS (long enough to ride out a reconnect blip), or START_GRACE_MS
 *   if it has never been on since they were added.
 */
export const MAX_GHOSTS = 3;
export const MAX_GUEST_GHOSTS = MAX_GHOSTS - 1;
export const REQUEST_TIMEOUT_MS = 30_000;
export const GONE_GRACE_MS = 1_500;
/** A newly added guest may still be switching their camera on (permission prompt, device start), so they get longer before their first frame. */
export const START_GRACE_MS = 15_000;

export type JoinPolicy = "ask" | "anyone" | "off";

/** What a guest is told about their own place on the overlay. */
export type GuestOverlayState = "on" | "off" | "pending" | "full" | "declined" | "closed" | "unavailable" | "timeout";

/** Outcome of a request for a spot; `reason` explains a refusal. */
export type AddResult =
  | { ok: true; status: "added" | "pending" }
  | { ok: false; reason: "full" | "closed" | "already" };

export class CoGhostRoster {
  policy: JoinPolicy = "ask";
  private ghosts: string[] = [];
  /** Presenter asked the guest; waiting for them to Allow. */
  private invites = new Map<string, number>();
  /** Guest asked; waiting for the presenter to Allow. */
  private requests = new Map<string, number>();
  private missingSince = new Map<string, number>();
  /** Co-ghosts whose camera has been seen on at least once since they were added. */
  private seenOn = new Set<string>();

  /** Guests on the overlay, in the order they were added. */
  get pinned(): string[] {
    return this.ghosts.slice();
  }

  /** Invites the presenter sent that the guest hasn't answered. */
  get invited(): string[] {
    return Array.from(this.invites.keys());
  }

  /** Guests waiting for the presenter to Allow them. */
  get requesting(): string[] {
    return Array.from(this.requests.keys());
  }

  get isFull(): boolean {
    return this.ghosts.length >= MAX_GUEST_GHOSTS;
  }

  has(id: string): boolean {
    return this.ghosts.includes(id);
  }

  /** The presenter asks a guest to appear. The guest must respond() before anything is shown. */
  invite(id: string, now: number): AddResult {
    if (this.has(id) || this.invites.has(id)) return { ok: false, reason: "already" };
    if (this.isFull) return { ok: false, reason: "full" };
    this.requests.delete(id);
    this.invites.set(id, now + REQUEST_TIMEOUT_MS);
    return { ok: true, status: "pending" };
  }

  /** The guest's answer to an invite. Only an outstanding invite can be accepted. */
  respond(id: string, accept: boolean): AddResult {
    if (!this.invites.has(id)) return { ok: false, reason: "already" };
    this.invites.delete(id);
    if (!accept) return { ok: true, status: "pending" };
    return this.add(id);
  }

  /** A guest asks to appear; what happens depends on the presenter's policy. */
  guestRequest(id: string, now: number): AddResult {
    if (this.has(id)) return { ok: false, reason: "already" };
    if (this.policy === "off") return { ok: false, reason: "closed" };
    // They asked for the same thing the presenter did: treat it as an accepted invite.
    if (this.invites.has(id)) {
      this.invites.delete(id);
      return this.add(id);
    }
    if (this.isFull) return { ok: false, reason: "full" };
    if (this.policy === "anyone") return this.add(id);
    if (!this.requests.has(id)) this.requests.set(id, now + REQUEST_TIMEOUT_MS);
    return { ok: true, status: "pending" };
  }

  /** The presenter answers a guest's request. */
  decide(id: string, allow: boolean): AddResult {
    if (!this.requests.has(id)) return { ok: false, reason: "already" };
    this.requests.delete(id);
    if (!allow) return { ok: true, status: "pending" };
    return this.add(id);
  }

  /** Takes someone off the overlay and clears anything pending for them. Returns whether there was anything to clear. */
  remove(id: string): boolean {
    const had = this.has(id) || this.invites.has(id) || this.requests.has(id);
    this.ghosts = this.ghosts.filter((ghost) => ghost !== id);
    this.invites.delete(id);
    this.requests.delete(id);
    this.missingSince.delete(id);
    this.seenOn.delete(id);
    return had;
  }

  /** Empties everything (overlay turned off). Returns everyone who had a spot or a pending ask. */
  clear(): string[] {
    const everyone = [...this.ghosts, ...Array.from(this.invites.keys()), ...Array.from(this.requests.keys())];
    this.ghosts = [];
    this.invites.clear();
    this.requests.clear();
    this.missingSince.clear();
    this.seenOn.clear();
    return everyone;
  }

  /** Drops pending invites/requests whose time is up. `invites` and `requests` list who lapsed, so each can be told. */
  expire(now: number): { invites: string[]; requests: string[] } {
    const lapsed = { invites: [] as string[], requests: [] as string[] };
    for (const [id, deadline] of Array.from(this.invites)) {
      if (now >= deadline) {
        this.invites.delete(id);
        lapsed.invites.push(id);
      }
    }
    for (const [id, deadline] of Array.from(this.requests)) {
      if (now >= deadline) {
        this.requests.delete(id);
        lapsed.requests.push(id);
      }
    }
    return lapsed;
  }

  /**
   * Drops co-ghosts who left or whose camera has stayed off past the grace
   * period, and pending asks from people who left.
   * @param eligible ids with a camera on right now
   * @param present  ids still in the meeting
   * @returns everyone dropped (ghosts and pending), so they can be told
   */
  prune(now: number, eligible: ReadonlySet<string>, present: ReadonlySet<string>): string[] {
    const dropped: string[] = [];
    for (const id of this.ghosts.slice()) {
      if (eligible.has(id)) {
        this.missingSince.delete(id);
        this.seenOn.add(id);
        continue;
      }
      const since = this.missingSince.get(id) ?? now;
      this.missingSince.set(id, since);
      const grace = this.seenOn.has(id) ? GONE_GRACE_MS : START_GRACE_MS;
      if (!present.has(id) || now - since >= grace) {
        this.remove(id);
        dropped.push(id);
      }
    }
    for (const id of [...Array.from(this.invites.keys()), ...Array.from(this.requests.keys())]) {
      if (present.has(id)) continue;
      this.remove(id);
      dropped.push(id);
    }
    return dropped;
  }

  private add(id: string): AddResult {
    if (this.isFull) return { ok: false, reason: "full" };
    this.ghosts.push(id);
    return { ok: true, status: "added" };
  }
}
