import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CoGhostRoster,
  GONE_GRACE_MS,
  START_GRACE_MS,
  MAX_GUEST_GHOSTS,
  REQUEST_TIMEOUT_MS,
} from "./co-ghosts.ts";
import { encodeMessage, parseToGuest, parseToPresenter } from "./overlay-protocol.ts";

const ids = (...list: string[]) => new Set(list);

test("an invited guest appears only after they accept", () => {
  const roster = new CoGhostRoster();
  assert.deepEqual(roster.invite("a", 0), { ok: true, status: "pending" });
  assert.deepEqual(roster.pinned, [], "not shown while waiting");
  assert.deepEqual(roster.invited, ["a"]);
  assert.deepEqual(roster.respond("a", true), { ok: true, status: "added" });
  assert.deepEqual(roster.pinned, ["a"]);
});

test("a declined invite adds nothing, and a guest can't accept an invite they never got", () => {
  const roster = new CoGhostRoster();
  roster.invite("a", 0);
  roster.respond("a", false);
  assert.deepEqual(roster.pinned, []);
  assert.deepEqual(roster.invited, []);
  assert.equal(roster.respond("b", true).ok, false);
  assert.deepEqual(roster.pinned, []);
});

test("an unanswered invite lapses after the timeout", () => {
  const roster = new CoGhostRoster();
  roster.invite("a", 1000);
  assert.deepEqual(roster.expire(1000 + REQUEST_TIMEOUT_MS - 1), { invites: [], requests: [] });
  assert.deepEqual(roster.expire(1000 + REQUEST_TIMEOUT_MS), { invites: ["a"], requests: [] });
  assert.equal(roster.respond("a", true).ok, false, "too late to accept");
});

test('"ask" holds a guest request until the presenter allows it', () => {
  const roster = new CoGhostRoster();
  assert.deepEqual(roster.guestRequest("a", 0), { ok: true, status: "pending" });
  assert.deepEqual(roster.requesting, ["a"]);
  assert.deepEqual(roster.pinned, []);
  assert.deepEqual(roster.decide("a", true), { ok: true, status: "added" });
  roster.guestRequest("b", 0);
  roster.decide("b", false);
  assert.deepEqual(roster.pinned, ["a"]);
});

test('"anyone" admits at once, and "off" refuses', () => {
  const roster = new CoGhostRoster();
  roster.policy = "anyone";
  assert.deepEqual(roster.guestRequest("a", 0), { ok: true, status: "added" });
  roster.policy = "off";
  assert.deepEqual(roster.guestRequest("b", 0), { ok: false, reason: "closed" });
  assert.deepEqual(roster.pinned, ["a"]);
});

test("the overlay holds the presenter plus two guests; a further request is refused as full", () => {
  const roster = new CoGhostRoster();
  roster.policy = "anyone";
  assert.equal(MAX_GUEST_GHOSTS, 2);
  roster.guestRequest("a", 0);
  roster.guestRequest("b", 0);
  assert.deepEqual(roster.guestRequest("c", 0), { ok: false, reason: "full" });
  assert.deepEqual(roster.invite("c", 0), { ok: false, reason: "full" });
  roster.policy = "ask";
  assert.deepEqual(roster.guestRequest("c", 0), { ok: false, reason: "full" });
  assert.deepEqual(roster.pinned, ["a", "b"], "in the order they were added");
});

test("a spot that fills while an ask is pending is refused when it's answered", () => {
  const roster = new CoGhostRoster();
  roster.invite("a", 0);
  roster.guestRequest("b", 0);
  roster.policy = "anyone";
  roster.guestRequest("c", 0);
  roster.guestRequest("d", 0);
  assert.deepEqual(roster.respond("a", true), { ok: false, reason: "full" });
  assert.deepEqual(roster.decide("b", true), { ok: false, reason: "full" });
});

test("either side can remove a guest, freeing the spot", () => {
  const roster = new CoGhostRoster();
  roster.policy = "anyone";
  roster.guestRequest("a", 0);
  roster.guestRequest("b", 0);
  assert.equal(roster.remove("a"), true);
  assert.deepEqual(roster.pinned, ["b"]);
  assert.deepEqual(roster.guestRequest("c", 0), { ok: true, status: "added" });
  assert.deepEqual(roster.pinned, ["b", "c"]);
});

test("a ghost drops when the guest leaves, or after their camera stays off past the grace", () => {
  const roster = new CoGhostRoster();
  roster.policy = "anyone";
  roster.guestRequest("a", 0);
  roster.guestRequest("b", 0);
  roster.prune(0, ids("a", "b"), ids("a", "b")); // both cameras seen on
  // a leaves the meeting: dropped at once.
  assert.deepEqual(roster.prune(100, ids("b"), ids("b")), ["a"]);
  // b's camera goes off but they stay: kept through a blip, dropped after the grace.
  assert.deepEqual(roster.prune(200, ids(), ids("b")), []);
  assert.deepEqual(roster.prune(200 + GONE_GRACE_MS - 1, ids(), ids("b")), []);
  assert.deepEqual(roster.prune(200 + GONE_GRACE_MS, ids(), ids("b")), ["b"]);
  assert.deepEqual(roster.pinned, []);
});

test("a camera that comes back within the grace keeps the ghost", () => {
  const roster = new CoGhostRoster();
  roster.policy = "anyone";
  roster.guestRequest("a", 0);
  roster.prune(0, ids("a"), ids("a"));
  roster.prune(10, ids(), ids("a"));
  roster.prune(1000, ids("a"), ids("a"));
  assert.deepEqual(roster.prune(1000 + GONE_GRACE_MS, ids(), ids("a")), [], "the clock restarted");
  assert.deepEqual(roster.pinned, ["a"]);
});

test("a guest just added gets longer to get their camera going before their first frame", () => {
  const roster = new CoGhostRoster();
  roster.policy = "anyone";
  roster.guestRequest("a", 0);
  assert.deepEqual(roster.prune(0, ids(), ids("a")), []);
  assert.deepEqual(roster.prune(START_GRACE_MS - 1, ids(), ids("a")), []);
  assert.deepEqual(roster.prune(START_GRACE_MS, ids(), ids("a")), ["a"]);
});

test("pending asks from someone who left are cleared", () => {
  const roster = new CoGhostRoster();
  roster.invite("a", 0);
  roster.guestRequest("b", 0);
  assert.deepEqual(roster.prune(1, ids(), ids()).sort(), ["a", "b"]);
  assert.deepEqual(roster.invited, []);
  assert.deepEqual(roster.requesting, []);
});

test("clear empties everything and reports who was affected", () => {
  const roster = new CoGhostRoster();
  roster.policy = "anyone";
  roster.guestRequest("a", 0);
  roster.invite("b", 0);
  assert.deepEqual(roster.clear().sort(), ["a", "b"]);
  assert.deepEqual(roster.pinned, []);
});

test("protocol round-trips and rejects anything malformed", () => {
  assert.deepEqual(parseToPresenter(encodeMessage({ t: "overlay-join-request" })), { t: "overlay-join-request" });
  assert.deepEqual(parseToPresenter(encodeMessage({ t: "overlay-response", accept: true })), { t: "overlay-response", accept: true });
  assert.deepEqual(parseToGuest(encodeMessage({ t: "overlay-state", state: "full" })), { t: "overlay-state", state: "full" });
  assert.deepEqual(parseToGuest(encodeMessage({ t: "overlay-request" })), { t: "overlay-request" });
  const raw = (value: string) => new TextEncoder().encode(value);
  assert.equal(parseToPresenter(raw("not json")), null);
  assert.equal(parseToPresenter(raw('{"t":"overlay-response","accept":"yes"}')), null);
  assert.equal(parseToGuest(raw('{"t":"overlay-state","state":"bogus"}')), null);
  assert.equal(parseToGuest(raw("[]")), null);
  assert.equal(parseToPresenter(encodeMessage({ t: "overlay-request" })), null, "guest messages aren't valid for the presenter");
});
