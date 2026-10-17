import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOM_BACKGROUND_MAX_BYTES,
  NO_BACKGROUND,
  fitWithin,
  parseBackgroundChoice,
  sameBackgroundChoice,
  serializeBackgroundChoice,
  validateCustomBackgroundFile,
} from "./meeting-backgrounds.ts";

test("nothing stored means no background (effects are off by default)", () => {
  assert.deepEqual(parseBackgroundChoice(null, false), NO_BACKGROUND);
  assert.deepEqual(parseBackgroundChoice("", true), NO_BACKGROUND);
});

test("stored choices round-trip", () => {
  for (const choice of [{ kind: "blur" }, { kind: "preset", id: "library" }, { kind: "custom" }] as const) {
    assert.deepEqual(parseBackgroundChoice(serializeBackgroundChoice(choice), true), choice);
  }
});

test("a custom choice without its stored image falls back to none", () => {
  assert.deepEqual(parseBackgroundChoice(serializeBackgroundChoice({ kind: "custom" }), false), NO_BACKGROUND);
});

test("garbage, unknown kinds and unknown preset ids fall back to none", () => {
  assert.deepEqual(parseBackgroundChoice("{not json", true), NO_BACKGROUND);
  assert.deepEqual(parseBackgroundChoice('"blur"', true), NO_BACKGROUND);
  assert.deepEqual(parseBackgroundChoice('{"kind":"sparkles"}', true), NO_BACKGROUND);
  assert.deepEqual(parseBackgroundChoice('{"kind":"preset","id":"gone"}', true), NO_BACKGROUND);
  assert.deepEqual(parseBackgroundChoice('{"kind":"preset"}', true), NO_BACKGROUND);
});

test("sameBackgroundChoice compares preset ids", () => {
  assert.equal(sameBackgroundChoice({ kind: "preset", id: "library" }, { kind: "preset", id: "library" }), true);
  assert.equal(sameBackgroundChoice({ kind: "preset", id: "library" }, { kind: "preset", id: "meadow" }), false);
  assert.equal(sameBackgroundChoice({ kind: "blur" }, { kind: "none" }), false);
});

test("only JPEG/PNG/WebP up to 10 MB are accepted", () => {
  assert.equal(validateCustomBackgroundFile({ type: "image/jpeg", size: 1000 }), null);
  assert.equal(validateCustomBackgroundFile({ type: "image/webp", size: CUSTOM_BACKGROUND_MAX_BYTES }), null);
  assert.match(validateCustomBackgroundFile({ type: "application/pdf", size: 1000 }) ?? "", /JPEG, PNG or WebP/);
  assert.match(validateCustomBackgroundFile({ type: "image/gif", size: 1000 }) ?? "", /JPEG, PNG or WebP/);
  assert.match(validateCustomBackgroundFile({ type: "image/png", size: CUSTOM_BACKGROUND_MAX_BYTES + 1 }) ?? "", /too large/);
});

test("fitWithin scales the longest edge down and never upscales", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1280), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(1000, 3000, 1280), { width: 427, height: 1280 });
  assert.deepEqual(fitWithin(640, 480, 1280), { width: 640, height: 480 });
});
