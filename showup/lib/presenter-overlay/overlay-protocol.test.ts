import test from "node:test";
import assert from "node:assert/strict";
import { encodeMessage, parseToGuest, type ToGuest } from "./overlay-protocol.ts";

test("a roster message round-trips", () => {
  const message: ToGuest = { t: "overlay-roster", ids: ["host-1", "guest-2"] };
  assert.deepEqual(parseToGuest(encodeMessage(message)), message);
  assert.deepEqual(parseToGuest(encodeMessage({ t: "overlay-roster", ids: [] })), { t: "overlay-roster", ids: [] });
});

test("malformed rosters are ignored", () => {
  const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  assert.equal(parseToGuest(raw({ t: "overlay-roster" })), null);
  assert.equal(parseToGuest(raw({ t: "overlay-roster", ids: "a" })), null);
  assert.equal(parseToGuest(raw({ t: "overlay-roster", ids: [1] })), null);
  assert.equal(parseToGuest(raw({ t: "overlay-roster", ids: [""] })), null);
  assert.equal(parseToGuest(raw({ t: "overlay-roster", ids: ["a", "b", "c", "d", "e"] })), null);
});
