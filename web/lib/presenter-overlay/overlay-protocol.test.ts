import test from "node:test";
import assert from "node:assert/strict";
import { encodeMessage, parseToGuest, parseToPresenter, type ToGuest } from "./overlay-protocol.ts";

test("messages round-trip", () => {
  assert.deepEqual(parseToPresenter(encodeMessage({ t: "overlay-join-request" })), { t: "overlay-join-request" });
  assert.deepEqual(parseToPresenter(encodeMessage({ t: "overlay-response", accept: true })), { t: "overlay-response", accept: true });
  assert.deepEqual(parseToPresenter(encodeMessage({ t: "overlay-leave" })), { t: "overlay-leave" });
  assert.deepEqual(parseToGuest(encodeMessage({ t: "overlay-state", state: "full" })), { t: "overlay-state", state: "full" });
  assert.deepEqual(parseToGuest(encodeMessage({ t: "overlay-request" })), { t: "overlay-request" });
});

test("malformed or cross-direction messages are rejected", () => {
  const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  assert.equal(parseToPresenter(new TextEncoder().encode("not json")), null);
  assert.equal(parseToPresenter(raw({ t: "overlay-response", accept: "yes" })), null);
  assert.equal(parseToGuest(raw({ t: "overlay-state", state: "bogus" })), null);
  assert.equal(parseToGuest(raw([])), null);
  assert.equal(parseToPresenter(encodeMessage({ t: "overlay-request" })), null, "guest messages aren't valid for the host");
  assert.equal(parseToGuest(encodeMessage({ t: "overlay-join-request" })), null, "host messages aren't valid for the guest");
});

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
