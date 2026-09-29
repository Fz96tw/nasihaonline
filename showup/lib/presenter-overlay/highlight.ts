/**
 * The highlighter band (the host's "horns" gesture): pure, clock-free geometry and blend rules, so they can be tested
 * without a canvas. The band is composited over the shared screen so the content underneath stays readable: a dark
 * text on a light page is darkened only by the tint (multiply), and on a dark page — where multiply would make the
 * yellow vanish — it is lightened instead (screen).
 */

/** The band's height as a fraction of the shared screen's height: about one line of text. */
export const HIGHLIGHT_HEIGHT = 0.022;
/** Opacity of the band with each blend. Multiply can only darken, so it can be fairly strong; screen lightens, so it is weaker. */
export const HIGHLIGHT_ALPHA_MULTIPLY = 0.5;
export const HIGHLIGHT_ALPHA_SCREEN = 0.35;
/** Content whose average luminance (0 black, 1 white) is below this counts as dark. */
export const DARK_LUMINANCE = 0.4;

export type HighlightBlend = "multiply" | "screen";

/** Average relative luminance (0–1) of RGBA pixel data. An empty image counts as light, so the default blend is multiply. */
export function averageLuminance(rgba: ArrayLike<number>): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    total += (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
    count++;
  }
  return count === 0 ? 1 : total / count;
}

/** How to draw the band over content of this luminance. */
export function highlightStyle(luminance: number): { blend: HighlightBlend; alpha: number } {
  return luminance < DARK_LUMINANCE ? { blend: "screen", alpha: HIGHLIGHT_ALPHA_SCREEN } : { blend: "multiply", alpha: HIGHLIGHT_ALPHA_MULTIPLY };
}

/**
 * The band as an axis-aligned rectangle in whatever unit `height` is in: centred on the line through the stroke's
 * first point (a highlight is locked to its start y), spanning the x range of its two points. Flat, square ends.
 */
export function bandRect(a: { x: number; y: number }, b: { x: number; y: number }, height: number): { x: number; y: number; width: number; height: number } {
  return { x: Math.min(a.x, b.x), y: a.y - height / 2, width: Math.abs(b.x - a.x), height };
}

/**
 * Where the fingertip puts the band's end: x follows the fingertip, y stays on the line the band started on, so the band
 * lines up with a line of text however the hand wobbles. `start` is the band's first point, or null for the first sample.
 */
export function lockedToStartY(start: { x: number; y: number } | null, at: { x: number; y: number }): { x: number; y: number } {
  return start ? { x: at.x, y: start.y } : at;
}
