/**
 * "Follow the speaker" for the presenter overlay: decides whose cut-out the
 * ghost shows, from who is speaking and how loudly. Pure and clock-free (the
 * caller passes `now`), so the timing rules can be tested without a room.
 *
 * Rules, in order of precedence:
 * - A pinned person always wins.
 * - With follow off the current person stays (until they leave).
 * - Only people with a camera can be shown; a speaker without one is ignored,
 *   so the ghost stays on whoever it was on.
 * - A new speaker takes over only after speaking continuously for
 *   TAKEOVER_MS, and never sooner than MIN_DWELL_MS after the last switch.
 * - If the person on screen has stopped speaking, the takeover is immediate
 *   (once the above hold). If they are still speaking, the challenger must be
 *   louder than them by LOUDER_MARGIN for CHALLENGE_MS running, so two people
 *   talking over each other don't make the ghost ping-pong.
 * - Silence keeps the last speaker.
 * The host is just another person: when they speak (and the guest doesn't),
 * the ghost comes back to them by the same rules.
 */
export const TAKEOVER_MS = 800;
export const CHALLENGE_MS = 1500;
export const MIN_DWELL_MS = 2000;
/** A speaker counts as still speaking this long after LiveKit last reported them (bridges gaps between words). */
export const SPEECH_GAP_MS = 400;
/** The challenger's smoothed level must exceed the incumbent's by this factor. */
export const LOUDER_MARGIN = 1.5;
const LEVEL_SMOOTHING = 0.3;

export class SpeakerFollower {
  private active: string;
  private follow = true;
  private pinned: string | null = null;
  private lastSwitchAt = Number.NEGATIVE_INFINITY;
  private lastHeardAt = new Map<string, number>();
  private speakingSince = new Map<string, number>();
  private level = new Map<string, number>();
  private louderSince = new Map<string, number>();

  constructor(initial: string) {
    this.active = initial;
  }

  get current(): string {
    return this.active;
  }

  setFollow(follow: boolean) {
    this.follow = follow;
  }

  /** Pin someone (null unpins). Takes effect on the next update. */
  setPinned(id: string | null) {
    this.pinned = id;
  }

  /**
   * @param now       current time in ms
   * @param speakers  audio level (0–1) of everyone LiveKit currently reports as speaking
   * @param eligible  ids that have a camera on and so can be shown
   * @returns the id whose cut-out should be showing
   */
  update(now: number, speakers: ReadonlyMap<string, number>, eligible: ReadonlySet<string>, fallback: string): string {
    for (const [id, level] of Array.from(speakers)) {
      if (!eligible.has(id)) continue;
      this.lastHeardAt.set(id, now);
      if (!this.speakingSince.has(id)) this.speakingSince.set(id, now);
      const previous = this.level.get(id) ?? level;
      this.level.set(id, previous + (level - previous) * LEVEL_SMOOTHING);
    }
    for (const id of Array.from(this.speakingSince.keys())) {
      const heard = this.lastHeardAt.get(id) ?? Number.NEGATIVE_INFINITY;
      if (!eligible.has(id) || now - heard > SPEECH_GAP_MS) {
        this.speakingSince.delete(id);
        this.louderSince.delete(id);
        this.level.delete(id);
      }
    }

    if (this.pinned && eligible.has(this.pinned)) {
      this.switchTo(this.pinned, now);
      return this.active;
    }
    if (!eligible.has(this.active)) {
      // Whoever was shown left or turned their camera off.
      this.switchTo(eligible.has(fallback) ? fallback : (eligible.values().next().value ?? this.active), now);
      return this.active;
    }
    if (!this.follow || now - this.lastSwitchAt < MIN_DWELL_MS) return this.active;

    const incumbentSpeaking = this.speakingSince.has(this.active);
    const incumbentLevel = this.level.get(this.active) ?? 0;
    let best: string | null = null;
    for (const [id, since] of Array.from(this.speakingSince)) {
      // Measured to the last time they were actually heard, so the gap-bridging grace doesn't pad a short burst.
      const heardFor = (this.lastHeardAt.get(id) ?? since) - since;
      if (id === this.active || heardFor < TAKEOVER_MS) continue;
      const level = this.level.get(id) ?? 0;
      if (incumbentSpeaking) {
        if (level > incumbentLevel * LOUDER_MARGIN) {
          if (!this.louderSince.has(id)) this.louderSince.set(id, now);
        } else {
          this.louderSince.delete(id);
        }
        if (now - (this.louderSince.get(id) ?? now) < CHALLENGE_MS) continue;
      }
      if (best === null || level > (this.level.get(best) ?? 0)) best = id;
    }
    if (best) this.switchTo(best, now);
    return this.active;
  }

  private switchTo(id: string, now: number) {
    if (id === this.active) return;
    this.active = id;
    this.lastSwitchAt = now;
    this.louderSince.clear();
  }
}
