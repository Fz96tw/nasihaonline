/**
 * Fits a short label inside a shape (Showup 30): the pure layout, with the text-measuring function passed in so it
 * can be tested without a canvas. Words are wrapped to the width available; the font shrinks until the block fits,
 * down to MIN_FONT_PX, and if it still doesn't fit the last line is cut short with an ellipsis.
 */

export type FitRect = { x: number; y: number; width: number; height: number };
export type FittedText = { fontPx: number; lineHeight: number; lines: string[] };

/** Smallest text worth drawing (pixels of output); below this the label is cut short instead. */
export const MIN_FONT_PX = 10;
/** Largest text (pixels of output) — a short label in a huge box shouldn't be poster-sized. */
export const MAX_FONT_PX = 72;
/** Line height as a multiple of the font size. */
export const LINE_HEIGHT = 1.2;
/** Fraction of the shape's box kept clear around the text. */
export const TEXT_PADDING = 0.06;

/** Voice Pin sticky note: the fraction of the note's shorter side kept clear around its text (all four sides). */
export const NOTE_INSET_RATIO = 0.12;

/**
 * The margin to add around a sticky note's text so that, when the note is drawn later, an inset of NOTE_INSET_RATIO of its
 * shorter side is exactly that margin. One rule for the live bubble, the pinned bounds and the pinned drawing, so
 * pinning never changes the text size, and the margin stays slim whatever the note's shape.
 */
export function notePadding(textWidth: number, textHeight: number): number {
  return (NOTE_INSET_RATIO * Math.min(textWidth, textHeight)) / (1 - 2 * NOTE_INSET_RATIO);
}

/** How much of a shape's own width/height is usable text area: all of a box (less padding), the inscribed rectangle of an ellipse, or — for plain text with no shape at all — the whole thing, no padding. */
function textAreaFraction(kind: "box" | "ellipse" | "text"): number {
  return kind === "ellipse" ? Math.SQRT1_2 : 1;
}

/** The rectangle to lay text out in: the box itself, or for an ellipse the largest axis-aligned rectangle inside it (about 70%), less padding. Plain text (no shape) gets the bounds back unchanged. */
export function textArea(bounds: FitRect, kind: "box" | "ellipse" | "text"): FitRect {
  const fraction = textAreaFraction(kind);
  const padding = kind === "text" ? 0 : TEXT_PADDING;
  const width = bounds.width * fraction * (1 - 2 * padding);
  const height = bounds.height * fraction * (1 - 2 * padding);
  return { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2, width, height };
}

/**
 * The inverse of `textArea`: given the text and a fixed font size (not shrunk to fit, since there's no
 * pre-drawn shape to fit into — a stamp grows the shape to the text instead), the smallest bounds that
 * would make `textArea` hand that text exactly this much room. Wraps at `maxWidth`. Null for empty text.
 */
export function growToFit(
  text: string,
  maxWidth: number,
  fontPx: number,
  measure: (text: string, fontPx: number) => number,
  kind: "box" | "ellipse" | "text",
): (FittedText & { width: number; height: number }) | null {
  if (!text) return null;
  const lines = wrapText(text, maxWidth, (candidate) => measure(candidate, fontPx));
  const lineHeight = fontPx * LINE_HEIGHT;
  const textWidth = lines.reduce((max, line) => Math.max(max, measure(line, fontPx)), 0);
  const textHeight = lines.length * lineHeight;
  const fraction = textAreaFraction(kind);
  const padding = kind === "text" ? 0 : TEXT_PADDING;
  const divisor = fraction * (1 - 2 * padding);
  return { fontPx, lineHeight, lines, width: textWidth / divisor, height: textHeight / divisor };
}

/** Greedy word wrap; a single word wider than the line is broken by characters. */
export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let rest = word;
    while (measure(rest) > maxWidth && rest.length > 1) {
      let take = rest.length - 1;
      while (take > 1 && measure(rest.slice(0, take)) > maxWidth) take--;
      lines.push(rest.slice(0, take));
      rest = rest.slice(take);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lays `text` out in `area`. `measure(text, fontPx)` returns the width the text would be drawn at that size.
 * Returns null when there is nothing to draw (no text, or an area too small for even MIN_FONT_PX).
 */
export function fitText(text: string, area: FitRect, measure: (text: string, fontPx: number) => number, minFontPx: number = MIN_FONT_PX): FittedText | null {
  if (!text || area.width < minFontPx || area.height < minFontPx) return null;
  let fontPx = Math.min(MAX_FONT_PX, Math.floor(area.height));
  for (; fontPx >= minFontPx; fontPx--) {
    const lines = wrapText(text, area.width, (candidate) => measure(candidate, fontPx));
    if (lines.length * fontPx * LINE_HEIGHT <= area.height) return { fontPx, lineHeight: fontPx * LINE_HEIGHT, lines };
  }
  // Doesn't fit even at the smallest size: keep the lines that do, and end the last with an ellipsis.
  fontPx = minFontPx;
  const all = wrapText(text, area.width, (candidate) => measure(candidate, fontPx));
  const fits = Math.max(1, Math.floor(area.height / (fontPx * LINE_HEIGHT)));
  const lines = all.slice(0, fits);
  if (all.length > fits) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && measure(`${last}…`, fontPx) > area.width) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return { fontPx, lineHeight: fontPx * LINE_HEIGHT, lines };
}
