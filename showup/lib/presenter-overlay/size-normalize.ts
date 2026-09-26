/**
 * Ghost size normalization (Showup 11): the pure, clock-free logic.
 * Picks a zoom per camera from how much of the frame the seated person fills, so a guest sitting far from
 * their camera and one sitting close look about the same size on the share. It corrects for where people
 * *sit*, not for how they move: a lean-in or a raised arm never changes the zoom, only a change that lasts.
 * Time is passed in, like speaker-follow.ts.
 */

/** How much of the frame height a person is scaled to fill (the head-top-to-bottom measurement of a typical webcam framing). */
export const TARGET_HEIGHT = 0.75;
/** Zoom limits. Zooming in is capped so a face-only close-up isn't blown up into a blurry giant. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;

/** A row only counts as the person (not a thin raised arm) when at least this fraction of its width is person. */
const ROW_FRACTION = 0.05;
/** Measurements at or below this are noise. */
const MIN_MEASUREMENT = 0.1;

/**
 * Measures the person from per-row counts of person pixels (row 0 is the top of the frame): the distance
 * from the top of the head to the bottom of the frame, as a fraction of the frame height (0–1).
 * Not the full bounding box, so a raised arm above the head doesn't change it: thin rows don't count as
 * the head, and the measurement runs to the frame bottom rather than to the person's own lowest pixel.
 * Returns null when it can't be trusted: nobody there, the head touches the top edge (it may be cut off),
 * or the person doesn't reach the bottom of the frame (so the bottom isn't where their body ends).
 */
export function measureFromRows(rowCounts: ArrayLike<number>, width: number, height: number): number | null {
  const minPixels = Math.max(2, width * ROW_FRACTION);
  let top = -1;
  for (let row = 0; row < height - 1; row++) {
    // Two rows in a row, so a single stray row of noise isn't taken for the head.
    if (rowCounts[row] >= minPixels && rowCounts[row + 1] >= minPixels) {
      top = row;
      break;
    }
  }
  if (top < 0) return null;
  const topMargin = Math.max(1, Math.round(height * 0.01));
  if (top < topMargin) return null;
  if (rowCounts[height - 1] < minPixels) return null;
  const measurement = (height - top) / height;
  return measurement >= MIN_MEASUREMENT ? measurement : null;
}

/** The zoom that makes a person of this measurement fill TARGET_HEIGHT of the frame, within the limits. */
export function zoomFor(measurement: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, TARGET_HEIGHT / measurement));
}

/** How the first measurements of a new camera are gathered. */
export const INITIAL_MS = 2500;
const INITIAL_MIN_SAMPLES = 3;
/** A new level must differ from the held one by more than this (fraction) to count as a change. */
export const CHANGE_FRACTION = 0.15;
/** …and hold for this long before the zoom follows it. */
export const SETTLE_MS = 10_000;
/** The zoom glides to a new level over this long. */
export const GLIDE_MS = 1000;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

export class SizeNormalizer {
  private firstAt: number | null = null;
  private initialSum = 0;
  private initialCount = 0;
  private initial = true;
  /** Set when the initial sizing ends, so the first zoom() after it lands on the final level instead of gliding to it. */
  private snap = false;
  /** The measurement the current zoom was chosen for. */
  private held: number | null = null;
  private target = 1;
  /** A different level that may be about to become the new one. */
  private candidateSum = 0;
  private candidateCount = 0;
  private candidateSince: number | null = null;
  private displayed = 1;
  private glideFrom = 1;
  private glideTo = 1;
  private glideStart = 0;

  /** Feeds a measurement (see measureFromRows) taken at `now` (ms); null means it couldn't be trusted, so the zoom holds. */
  observe(now: number, measurement: number | null) {
    if (measurement === null) {
      // Not trustworthy: hold, and don't let a change in progress keep counting through it.
      this.candidateSince = null;
      this.candidateCount = 0;
      this.candidateSum = 0;
      return;
    }
    if (this.initial) {
      this.firstAt ??= now;
      this.initialSum += measurement;
      this.initialCount++;
      const mean = this.initialSum / this.initialCount;
      if (this.initialCount >= INITIAL_MIN_SAMPLES) this.target = zoomFor(mean);
      if (now - this.firstAt >= INITIAL_MS && this.initialCount >= INITIAL_MIN_SAMPLES) {
        this.held = mean;
        this.initial = false;
        this.snap = true;
      }
      return;
    }
    const held = this.held as number;
    if (Math.abs(measurement - held) / held <= CHANGE_FRACTION) {
      this.candidateSince = null;
      this.candidateCount = 0;
      this.candidateSum = 0;
      return;
    }
    let candidate = this.candidateCount > 0 ? this.candidateSum / this.candidateCount : null;
    if (candidate === null || Math.abs(measurement - candidate) / candidate > CHANGE_FRACTION) {
      // A different new level: start timing again from here.
      this.candidateSince = now;
      this.candidateSum = 0;
      this.candidateCount = 0;
      candidate = null;
    }
    this.candidateSum += measurement;
    this.candidateCount++;
    if (this.candidateSince !== null && now - this.candidateSince >= SETTLE_MS) {
      this.held = this.candidateSum / this.candidateCount;
      this.target = zoomFor(this.held);
      this.candidateSince = null;
      this.candidateCount = 0;
      this.candidateSum = 0;
    }
  }

  /** The zoom to draw with at `now`. With `enabled` false the zoom is 1 (full-frame sizing); switching either way glides. */
  zoom(now: number, enabled: boolean): number {
    const goal = enabled ? this.target : 1;
    if (this.initial || this.snap) {
      // Sized right away, without gliding into place.
      this.snap = false;
      this.displayed = goal;
      this.glideFrom = goal;
      this.glideTo = goal;
      return goal;
    }
    if (goal !== this.glideTo) {
      this.glideFrom = this.displayed;
      this.glideTo = goal;
      this.glideStart = now;
    }
    const t = Math.min(1, Math.max(0, (now - this.glideStart) / GLIDE_MS));
    this.displayed = this.glideFrom + (this.glideTo - this.glideFrom) * smoothstep(t);
    return this.displayed;
  }
}
