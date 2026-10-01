import test from "node:test";
import assert from "node:assert/strict";
import { applyOverrides, DEFAULT_OVERRIDES, sampleOutbound, summarize, topEncodingIndex } from "./share-quality.ts";

const original = [
  { rid: "q", maxBitrate: 625_000, maxFramerate: 15, scaleResolutionDownBy: 2, active: true },
  { rid: "f", maxBitrate: 2_500_000, maxFramerate: 15, scaleResolutionDownBy: 1, active: true },
];

test("top encoding is the least scaled one", () => {
  assert.equal(topEncodingIndex(original), 1);
});

test("defaults leave encodings unchanged", () => {
  assert.deepEqual(applyOverrides(original, original, DEFAULT_OVERRIDES), original);
});

test("bitrate and fps overrides hit the top layer, low layer scales with it", () => {
  const out = applyOverrides(original, original, { maxBitrate: 5_000_000, maxFramerate: 30, lowLayers: true });
  assert.equal(out[1].maxBitrate, 5_000_000);
  assert.equal(out[0].maxBitrate, 1_250_000);
  assert.equal(out[0].maxFramerate, 30);
});

test("lowLayers off deactivates only the reduced layers; Auto restores the original", () => {
  const off = applyOverrides(original, original, { ...DEFAULT_OVERRIDES, lowLayers: false });
  assert.deepEqual(off.map((e) => e.active), [false, true]);
  const back = applyOverrides(off, original, DEFAULT_OVERRIDES);
  assert.deepEqual(back, original);
});

test("no encodings is a no-op", () => {
  assert.deepEqual(applyOverrides([], [], DEFAULT_OVERRIDES), []);
});

test("sampleOutbound picks the busiest video layer and summarize computes rates", () => {
  const a = sampleOutbound(
    [
      { type: "outbound-rtp", kind: "video", bytesSent: 100, framesEncoded: 10, frameWidth: 960, frameHeight: 540 },
      { type: "outbound-rtp", kind: "video", bytesSent: 1000, framesEncoded: 10, frameWidth: 1920, frameHeight: 1080, qualityLimitationReason: "cpu" },
      { type: "outbound-rtp", kind: "audio", bytesSent: 99999 },
    ],
    0,
  )!;
  assert.equal(a.frameWidth, 1920);
  const b = { ...a, at: 2000, bytesSent: 251_000, framesEncoded: 40 };
  const s = summarize(a, b)!;
  assert.equal(Math.round(s.kbps), 1000);
  assert.equal(s.fps, 15);
  assert.equal(s.limitedBy, "cpu");
  assert.equal(summarize(a, a), null);
});
