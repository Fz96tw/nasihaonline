import { test } from "node:test";
import assert from "node:assert/strict";
import { LINE_HEIGHT, MAX_FONT_PX, MIN_FONT_PX, TEXT_PADDING, fitText, textArea, wrapText } from "./text-fit.ts";

/** Every character is 0.5 em wide, so widths are easy to reason about. */
const measure = (text: string, fontPx: number) => text.length * fontPx * 0.5;
const at1 = (text: string) => text.length;

test("a box's text area is the box less padding; an ellipse's is the inscribed rectangle", () => {
  const box = textArea({ x: 100, y: 50, width: 200, height: 100 }, "box");
  assert.ok(Math.abs(box.width - 200 * (1 - 2 * TEXT_PADDING)) < 1e-9);
  assert.ok(Math.abs(box.x + box.width / 2 - 200) < 1e-9 && Math.abs(box.y + box.height / 2 - 100) < 1e-9, "centred");
  const ellipse = textArea({ x: 100, y: 50, width: 200, height: 100 }, "ellipse");
  assert.ok(ellipse.width < box.width * 0.75 && ellipse.height < box.height * 0.75, "about 70% of the box");
  assert.ok(Math.abs(ellipse.x + ellipse.width / 2 - 200) < 1e-9 && Math.abs(ellipse.y + ellipse.height / 2 - 100) < 1e-9);
});

test("the corners of the ellipse's text rectangle lie inside the ellipse", () => {
  const bounds = { x: 0, y: 0, width: 300, height: 120 };
  const area = textArea(bounds, "ellipse");
  const corner = { x: area.x + area.width, y: area.y + area.height };
  const nx = (corner.x - 150) / 150;
  const ny = (corner.y - 60) / 60;
  assert.ok(nx * nx + ny * ny <= 1 + 1e-9);
});

test("wrapText breaks between words, never mid-word when it can avoid it", () => {
  assert.deepEqual(wrapText("look at this button", 10, at1), ["look at", "this", "button"]);
  assert.deepEqual(wrapText("hi", 10, at1), ["hi"]);
  assert.deepEqual(wrapText("", 10, at1), []);
});

test("a word wider than the line is broken by characters", () => {
  const lines = wrapText("abcdefghijklmnop", 5, at1);
  assert.ok(lines.length >= 4);
  assert.ok(lines.every((line) => line.length <= 5));
  assert.equal(lines.join(""), "abcdefghijklmnop");
});

test("short text in a big area is capped at the largest font, on one line", () => {
  const fitted = fitText("Hi", { x: 0, y: 0, width: 2000, height: 2000 }, measure);
  assert.ok(fitted);
  assert.equal(fitted.fontPx, MAX_FONT_PX);
  assert.deepEqual(fitted.lines, ["Hi"]);
});

test("the font shrinks until the wrapped text fits the area", () => {
  const area = { x: 0, y: 0, width: 120, height: 60 };
  const fitted = fitText("Check this number carefully", area, measure);
  assert.ok(fitted);
  assert.ok(fitted.fontPx < MAX_FONT_PX && fitted.fontPx >= MIN_FONT_PX);
  assert.ok(fitted.lines.length * fitted.lineHeight <= area.height + 1e-9, "fits the height");
  assert.ok(fitted.lines.every((line) => measure(line, fitted.fontPx) <= area.width + 1e-9), "fits the width");
  assert.equal(fitted.lineHeight, fitted.fontPx * LINE_HEIGHT);
  const bigger = fitText("Check this number carefully", { x: 0, y: 0, width: 240, height: 120 }, measure);
  assert.ok(bigger && bigger.fontPx >= fitted.fontPx, "a bigger area never gives smaller text");
});

test("text that can't fit even at the smallest size is cut short with an ellipsis", () => {
  const area = { x: 0, y: 0, width: 60, height: 14 };
  const fitted = fitText("a fairly long label that will never fit in here", area, measure);
  assert.ok(fitted);
  assert.equal(fitted.fontPx, MIN_FONT_PX);
  assert.equal(fitted.lines.length, 1);
  assert.ok(fitted.lines[0].endsWith("…"));
  assert.ok(measure(fitted.lines[0], fitted.fontPx) <= area.width + 1e-9);
});

test("no text, or an area too small to read, draws nothing", () => {
  assert.equal(fitText("", { x: 0, y: 0, width: 200, height: 100 }, measure), null);
  assert.equal(fitText("Hi", { x: 0, y: 0, width: 5, height: 100 }, measure), null);
  assert.equal(fitText("Hi", { x: 0, y: 0, width: 200, height: 5 }, measure), null);
});
