import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RECORDING_QUALITY, RECORDING_QUALITIES, RECORDING_QUALITY_IDS, parseRecordingQuality } from "./recording-quality.ts";

test("unknown or missing ids fall back to the default", () => {
  for (const bad of [undefined, null, "", "4k", 5, {}, "__proto__"]) assert.equal(parseRecordingQuality(bad), DEFAULT_RECORDING_QUALITY);
});

test("every id parses to itself and has a preset with even dimensions", () => {
  for (const id of RECORDING_QUALITY_IDS) {
    assert.equal(parseRecordingQuality(id), id);
    const q = RECORDING_QUALITIES[id];
    assert.equal(q.id, id);
    assert.equal(q.width % 2, 0);
    assert.equal(q.height % 2, 0);
  }
});

test("standard keeps the previous hard-coded recording settings", () => {
  const q = RECORDING_QUALITIES.standard;
  assert.deepEqual([q.width, q.height, q.framerate, q.videoBitrate], [1280, 720, 20, 2000]);
});
