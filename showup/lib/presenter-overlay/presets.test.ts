import { test } from "node:test";
import assert from "node:assert/strict";
import { ANNOTATION_PRESETS, LOOK_PRESETS, TRUST_PRESETS, presetMatches } from "./presets.ts";

test("presetMatches ignores fields the preset doesn't define", () => {
  const current: { span: boolean; opacity: number; scale: number; background: string } = {
    span: true,
    opacity: 0.45,
    scale: 1,
    background: "keep",
  };
  assert.equal(presetMatches({ span: true, opacity: 0.45 }, current), true);
});

test("presetMatches returns false the moment one defined field drifts", () => {
  assert.equal(presetMatches({ span: true, opacity: 0.45 }, { span: true, opacity: 0.5 }), false);
});

test("a preset with a partial field set never checks fields it omits, so it never forces a full reset", () => {
  const fields = { span: true, opacity: 0.45 };
  // scale/background/position are absent from `current` entirely — still matches.
  assert.equal(presetMatches(fields, { span: true, opacity: 0.45 }), true);
});

test("Voice Pin's checkbox unsyncs Whiteboard Mode's button the moment it drifts from the bundled value", () => {
  const whiteboard = ANNOTATION_PRESETS.find((p) => p.id === "whiteboard")!;
  const current = { gestures: true, arrowMode: false, penColor: "red" as const, voicePin: true };
  assert.equal(presetMatches(whiteboard.fields, current), true, "matches while voicePin still agrees with the bundled value");
  assert.equal(presetMatches(whiteboard.fields, { ...current, voicePin: false }), false, "unticking the in-context Voice Pin checkbox un-highlights Whiteboard Mode's own button");
});

test("preset catalog matches the agreed spec", () => {
  assert.deepEqual(
    LOOK_PRESETS.map((p) => [p.id, p.fields]),
    [
      ["pip", { scale: 0.3, background: "keep", panelShape: "rounded", opacity: 1, position: "right", span: false }],
      ["full-screen-reach", { span: true, opacity: 0.45, background: "remove" }],
      ["talking-head", { scale: 1, position: "center", background: "remove", opacity: 1, span: false }],
      ["minimal-corner", { scale: 0.3, opacity: 0.35, background: "remove", position: "left", span: false }],
    ],
  );
  assert.deepEqual(
    TRUST_PRESETS.map((p) => [p.id, p.fields]),
    [
      ["locked-webinar", { policy: "off", pointerPolicy: "off", drawPolicy: "off", followSpeaker: false, pinnedId: "self" }],
      ["open-floor", { policy: "ask", pointerPolicy: "on", drawPolicy: "ask" }],
      ["qa-only", { policy: "ask", pointerPolicy: "on", drawPolicy: "off" }],
    ],
  );
  assert.deepEqual(
    ANNOTATION_PRESETS.map((p) => [p.id, p.fields]),
    [
      ["annotation-off", { gestures: false }],
      ["whiteboard", { gestures: true, arrowMode: false, penColor: "red", voicePin: true }],
    ],
  );
});
