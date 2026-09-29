import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUEST_POINTER_COLORS,
  GuestPointerBoard,
  POINTER_MIN_INTERVAL_MS,
  POINTER_REQUEST_TIMEOUT_MS,
  POINTER_SEND_INTERVAL_MS,
  POINTER_TIMEOUT_MS,
  PointerSender,
  encodePointerMessage,
  mapGuestPenToScreen,
  mapGuestPointer,
  mapGuestZoomPoint,
  parseDrawToGuest,
  parseDrawToHost,
  parsePointerToGuest,
  parsePointerToHost,
  parseZoomToGuest,
  parseZoomToHost,
} from "./guest-pointer.ts";
import { ScreenViewport, screenToOutput } from "./screen-zoom.ts";

const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const on = (u = 0.5, v = 0.5) => ({ u, v, on: true });

test("messages round-trip", () => {
  assert.deepEqual(parsePointerToHost(encodePointerMessage({ t: "pointer", u: 0.25, v: 0.75, on: true })), { t: "pointer", u: 0.25, v: 0.75, on: true });
  assert.deepEqual(parsePointerToHost(encodePointerMessage({ t: "pointer", u: 0, v: 1, on: false })), { t: "pointer", u: 0, v: 1, on: false });
  assert.deepEqual(parsePointerToHost(encodePointerMessage({ t: "pointer-request" })), { t: "pointer-request" });
  assert.deepEqual(parsePointerToGuest(encodePointerMessage({ t: "pointer-status", status: "allowed" })), { t: "pointer-status", status: "allowed" });
});

test("malformed, out-of-range and unknown messages are ignored without throwing", () => {
  for (const bad of [
    { t: "pointer" },
    { t: "pointer", u: 0.5, v: 0.5 },
    { t: "pointer", u: "0.5", v: 0.5, on: true },
    { t: "pointer", u: 1.01, v: 0.5, on: true },
    { t: "pointer", u: -0.1, v: 0.5, on: true },
    { t: "pointer", u: null, v: 0.5, on: true },
    { t: "pointer", u: 0.5, v: 0.5, on: "yes" },
    { t: "zoom", u: 0.5, v: 0.5 },
    { t: "reset" },
    { t: "pointer-status", status: "allowed" },
    [],
    "text",
    7,
    null,
  ]) {
    assert.equal(parsePointerToHost(raw(bad)), null, JSON.stringify(bad));
  }
  assert.equal(parsePointerToGuest(raw({ t: "pointer-status", status: "admin" })), null);
  assert.equal(parsePointerToGuest(raw({ t: "pointer-request" })), null);
  assert.equal(parsePointerToHost(new TextEncoder().encode("{not json")), null);
  assert.equal(parsePointerToHost(new Uint8Array(0)), null);
  assert.equal(parsePointerToHost(raw({ t: "pointer", u: 0.5, v: 0.5, on: true, pad: "x".repeat(200) })), null, "oversized");
  // NaN/Infinity encode as null in JSON, so they can't get through either.
  assert.equal(parsePointerToHost(raw({ t: "pointer", u: Number.NaN, v: 0.5, on: true })), null);
});

test("the pointer channel parses nothing but a pointer position or request: a zoom, pan or draw message isn't one", () => {
  for (const t of ["zoom", "pan", "reset", "spotlight", "draw", "reaction"]) {
    assert.equal(parsePointerToHost(raw({ t, u: 0.5, v: 0.5, on: true })), null, t);
  }
});

test("pointing is off by default and needs a ghost on the share", () => {
  const board = new GuestPointerBoard();
  assert.equal(board.policy, "off");
  assert.equal(board.status("a", true), "off");
  assert.equal(board.accept("a", on(), true, 0), false);
  board.policy = "on";
  assert.equal(board.status("a", true), "allowed");
  assert.equal(board.status("a", false), "off", "no ghost on the share, no pointer");
  assert.equal(board.accept("a", on(), false, 0), false, "messages from a guest who isn't shown are ignored");
  assert.deepEqual(board.dots(0, ["host"]), []);
  assert.equal(board.accept("a", on(), true, 0), true);
  assert.equal(board.dots(0, ["a"]).length, 1);
});

test("with the policy On every shown guest gets a dot in their own colour", () => {
  const board = new GuestPointerBoard();
  board.policy = "on";
  board.accept("a", on(0.2, 0.3), true, 0);
  board.accept("b", on(0.6, 0.7), true, 0);
  const dots = board.dots(0, ["a", "b"]);
  assert.equal(dots.length, 2);
  assert.notEqual(dots[0].color, dots[1].color);
  for (const dot of dots) assert.ok(GUEST_POINTER_COLORS.includes(dot.color));
  assert.ok(!GUEST_POINTER_COLORS.some((color) => color.toLowerCase() === "#ff3030" || color.toLowerCase() === "#ff2a2a"), "never the host's red");
  assert.deepEqual(dots.map((dot) => dot.id).sort(), ["a", "b"]);
  // The colour stays with the guest.
  board.accept("a", on(0.25, 0.3), true, 100);
  assert.equal(board.dots(100, ["a", "b"]).find((dot) => dot.id === "a")?.color, dots.find((dot) => dot.id === "a")?.color);
});

test("Ask me: a request must be approved before anything is accepted", () => {
  const board = new GuestPointerBoard();
  board.policy = "ask";
  assert.equal(board.status("a", true), "ask");
  assert.equal(board.accept("a", on(), true, 0), false, "not approved yet");
  assert.equal(board.request("a", true, 0), "pending");
  assert.deepEqual(board.requesting, ["a"]);
  assert.equal(board.accept("a", on(), true, 10), false, "still waiting");
  board.decide("a", true);
  assert.equal(board.status("a", true), "allowed");
  assert.equal(board.accept("a", on(), true, 100), true);
});

test("a declined request adds nothing, a guest who isn't shown can't request, and requests lapse", () => {
  const board = new GuestPointerBoard();
  board.policy = "ask";
  assert.equal(board.request("a", false, 0), "off");
  assert.deepEqual(board.requesting, []);
  board.request("a", true, 0);
  board.decide("a", false);
  assert.equal(board.status("a", true), "ask");
  board.request("a", true, 0);
  assert.deepEqual(board.expire(POINTER_REQUEST_TIMEOUT_MS - 1), []);
  assert.deepEqual(board.expire(POINTER_REQUEST_TIMEOUT_MS), ["a"]);
  assert.equal(board.status("a", true), "ask");
  // A request only counts under "Ask me".
  board.policy = "off";
  assert.equal(board.request("a", true, 0), "off");
});

test("the host can revoke a guest at any time, under either policy, and a revoked guest's dot goes at once", () => {
  const board = new GuestPointerBoard();
  board.policy = "on";
  board.accept("a", on(), true, 0);
  board.revoke("a");
  assert.equal(board.status("a", true), "off");
  assert.equal(board.isBlocked("a"), true);
  assert.deepEqual(board.dots(1, ["a"]), []);
  assert.equal(board.accept("a", on(), true, 100), false);
  assert.equal(board.request("a", true, 100), "off", "a revoked guest can't ask again until the host allows them");
  board.allow("a");
  assert.equal(board.status("a", true), "allowed");

  const asked = new GuestPointerBoard();
  asked.policy = "ask";
  asked.request("b", true, 0);
  asked.decide("b", true);
  asked.revoke("b");
  assert.equal(asked.status("b", true), "off");
});

test("the dot disappears about half a second after the last active message, or when the ghost leaves the share", () => {
  const board = new GuestPointerBoard();
  board.policy = "on";
  board.accept("a", on(), true, 1000);
  assert.equal(board.dots(1000 + POINTER_TIMEOUT_MS - 250, ["a"])[0].fade, 1);
  const fading = board.dots(1000 + POINTER_TIMEOUT_MS - 100, ["a"]);
  assert.ok(fading[0].fade > 0 && fading[0].fade < 1);
  assert.equal(board.isPointing("a", 1000 + POINTER_TIMEOUT_MS), true);
  assert.deepEqual(board.dots(1000 + POINTER_TIMEOUT_MS + 1, ["a"]), []);
  assert.equal(board.isPointing("a", 1000 + POINTER_TIMEOUT_MS + 1), false);

  board.accept("a", on(), true, 5000);
  assert.deepEqual(board.dots(5001, ["host"]), [], "ghost no longer on the share");
  board.accept("a", on(), true, 6000);
  assert.deepEqual(board.dots(6001, ["a"]).length, 1);
  board.accept("a", { u: 0, v: 0, on: false }, true, 6100);
  assert.deepEqual(board.dots(6101, ["a"]), [], "an off message ends the dot");
});

test("messages arriving too fast are ignored, and the dot glides toward the latest position", () => {
  const board = new GuestPointerBoard();
  board.policy = "on";
  assert.equal(board.accept("a", on(0.1, 0.1), true, 1000), true);
  assert.equal(board.accept("a", on(0.9, 0.9), true, 1000 + POINTER_MIN_INTERVAL_MS - 1), false, "excessive");
  assert.equal(board.accept("a", on(0.9, 0.9), true, 1000 + POINTER_MIN_INTERVAL_MS), true);
  const early = board.dots(1000 + POINTER_MIN_INTERVAL_MS, ["a"])[0];
  assert.ok(early.u < 0.9 && early.u >= 0.1, "not a jump");
  const later = board.dots(1000 + POINTER_MIN_INTERVAL_MS + 2000, ["a"]);
  assert.equal(later.length, 0, "long after the last message it's gone");
  board.accept("a", on(0.9, 0.9), true, 4000);
  for (let t = 4010; t < 4400; t += 10) board.accept("a", on(0.9, 0.9), true, t);
  assert.ok(Math.abs(board.dots(4400, ["a"])[0].u - 0.9) < 0.01, "settles on the fingertip");
});

test("out-of-range values that get past parsing still don't produce a dot", () => {
  const board = new GuestPointerBoard();
  board.policy = "on";
  assert.equal(board.accept("a", { u: 2, v: 0.5, on: true }, true, 0), false);
  assert.equal(board.accept("a", { u: Number.NaN, v: 0.5, on: true }, true, 0), false);
  assert.deepEqual(board.dots(1, ["a"]), []);
});

test("guests who leave are forgotten, and clearing keeps approvals and revokes", () => {
  const board = new GuestPointerBoard();
  board.policy = "ask";
  board.request("a", true, 0);
  board.decide("a", true);
  board.accept("a", on(), true, 0);
  board.revoke("c");
  board.clearLive();
  assert.deepEqual(board.dots(1, ["a"]), []);
  assert.equal(board.status("a", true), "allowed");
  assert.equal(board.status("c", true), "off");
  board.prune(new Set(["c"]));
  assert.equal(board.status("a", true), "ask");
  assert.equal(board.isBlocked("c"), true);
});

test("a guest sends about 13 positions a second, then exactly one off message", () => {
  const sender = new PointerSender();
  assert.equal(sender.next(0, null), null, "nothing to say when not pointing");
  assert.deepEqual(sender.next(1000, { u: 0.4, v: 0.6 }), { t: "pointer", u: 0.4, v: 0.6, on: true });
  assert.equal(sender.next(1000 + POINTER_SEND_INTERVAL_MS - 1, { u: 0.5, v: 0.5 }), null, "throttled");
  assert.deepEqual(sender.next(1000 + POINTER_SEND_INTERVAL_MS, { u: 0.5, v: 0.5 }), { t: "pointer", u: 0.5, v: 0.5, on: true });
  assert.deepEqual(sender.next(1200, null), { t: "pointer", u: 0, v: 0, on: false });
  assert.equal(sender.next(1300, null), null, "only one off message");
  assert.deepEqual(sender.next(1301, { u: 0.1, v: 0.1 }), { t: "pointer", u: 0.1, v: 0.1, on: true }, "a new point starts straight away");
  // Positions are clamped and rounded so they always parse.
  const clamped = new PointerSender().next(0, { u: 1.4, v: -0.2 });
  assert.deepEqual(clamped, { t: "pointer", u: 1, v: 0, on: true });
  assert.ok(parsePointerToHost(encodePointerMessage(clamped!)));
});

test("a guest's fingertip lands on their ghost's fingertip, mirrored or not", () => {
  const ghost = { x: 100, y: 200, width: 400, height: 300 };
  // Unmirrored: the camera's left is the ghost's left.
  assert.deepEqual(mapGuestPointer(0.25, 0.5, { ...ghost, mirror: false }), { x: 200, y: 350 });
  assert.deepEqual(mapGuestPointer(0, 0, { ...ghost, mirror: false }), { x: 100, y: 200 });
  assert.deepEqual(mapGuestPointer(1, 1, { ...ghost, mirror: false }), { x: 500, y: 500 });
  // Mirrored (the host's Mirror setting): the camera's left is the ghost's right, so reaching toward an item lands the dot on it.
  assert.deepEqual(mapGuestPointer(0.25, 0.5, { ...ghost, mirror: true }), { x: 400, y: 350 });
  assert.deepEqual(mapGuestPointer(0, 0, { ...ghost, mirror: true }), { x: 500, y: 200 });
  assert.deepEqual(mapGuestPointer(1, 1, { ...ghost, mirror: true }), { x: 100, y: 500 });
  // A smaller group ghost placed elsewhere: position and scale come from the placement.
  assert.deepEqual(mapGuestPointer(0.5, 0.5, { x: 800, y: 100, width: 200, height: 100, mirror: true }), { x: 900, y: 150 });
});

test("draw messages round-trip, and pointer and draw messages are not interchangeable", () => {
  assert.deepEqual(parseDrawToHost(encodePointerMessage({ t: "draw", u: 0.2, v: 0.8, on: true })), { t: "draw", u: 0.2, v: 0.8, on: true });
  assert.deepEqual(parseDrawToHost(encodePointerMessage({ t: "draw", u: 0, v: 0, on: false })), { t: "draw", u: 0, v: 0, on: false });
  assert.deepEqual(parseDrawToHost(encodePointerMessage({ t: "draw-request" })), { t: "draw-request" });
  assert.deepEqual(parseDrawToGuest(encodePointerMessage({ t: "draw-status", status: "pending" })), { t: "draw-status", status: "pending" });
  assert.equal(parseDrawToHost(encodePointerMessage({ t: "pointer", u: 0.2, v: 0.8, on: true })), null, "a pointer message isn't a draw message");
  assert.equal(parsePointerToHost(encodePointerMessage({ t: "draw", u: 0.2, v: 0.8, on: true })), null, "and the other way round");
  assert.equal(parseDrawToGuest(encodePointerMessage({ t: "pointer-status", status: "allowed" })), null);
});

test("invalid, out-of-range or oversized draw messages are ignored without throwing", () => {
  for (const bad of [
    { t: "draw" },
    { t: "draw", u: 0.5, v: 0.5 },
    { t: "draw", u: 1.5, v: 0.5, on: true },
    { t: "draw", u: -1, v: 0.5, on: true },
    { t: "draw", u: "0.5", v: 0.5, on: true },
    { t: "draw", u: 0.5, v: null, on: true },
    { t: "draw", u: 0.5, v: 0.5, on: 1 },
    { t: "draw-status", status: "allowed" },
    { t: "zoom", u: 0.5, v: 0.5, on: true },
    { t: "spotlight" },
    { t: "reaction", kind: "wave" },
    [],
    "text",
    null,
  ]) {
    assert.equal(parseDrawToHost(raw(bad)), null, JSON.stringify(bad));
  }
  assert.equal(parseDrawToGuest(raw({ t: "draw-status", status: "admin" })), null);
  assert.equal(parseDrawToHost(new TextEncoder().encode("{oops")), null);
  assert.equal(parseDrawToHost(raw({ t: "draw", u: 0.5, v: 0.5, on: true, pad: "x".repeat(200) })), null, "oversized");
});

test("drawing has its own policy and permissions, off by default, and the same rules as pointing", () => {
  const pointer = new GuestPointerBoard();
  const draw = new GuestPointerBoard();
  assert.equal(draw.policy, "off");
  pointer.policy = "on";
  assert.equal(pointer.status("a", true), "allowed");
  assert.equal(draw.status("a", true), "off", "letting a guest point doesn't let them draw");
  assert.equal(draw.accept("a", on(), true, 0), false);
  draw.policy = "ask";
  assert.equal(draw.request("a", true, 0), "pending");
  assert.equal(draw.accept("a", on(), true, 10), false, "not approved yet");
  draw.decide("a", true);
  assert.equal(draw.accept("a", on(), true, 100), true);
  assert.equal(draw.accept("a", on(), false, 200), false, "a guest whose ghost isn't shown can't draw");
  draw.revoke("a");
  assert.equal(draw.canPoint("a", true), false);
  assert.deepEqual(draw.dots(300, ["a"]), [], "a revoked guest's pen is gone at once, so their stroke ends");
  assert.equal(pointer.status("a", true), "allowed", "revoking drawing leaves pointing alone");
});

test("a guest's pen has the same colour as their pointer dot when the boards share a colour map", () => {
  const colors = new Map<string, string>();
  const pointer = new GuestPointerBoard(colors);
  const draw = new GuestPointerBoard(colors);
  pointer.policy = "on";
  draw.policy = "on";
  pointer.accept("a", on(), true, 0);
  draw.accept("b", on(), true, 0);
  draw.accept("a", on(), true, 0);
  pointer.accept("b", on(), true, 0);
  const pointerColors = new Map(pointer.dots(0, ["a", "b"]).map((dot) => [dot.id, dot.color]));
  const drawColors = new Map(draw.dots(0, ["a", "b"]).map((dot) => [dot.id, dot.color]));
  assert.equal(drawColors.get("a"), pointerColors.get("a"));
  assert.equal(drawColors.get("b"), pointerColors.get("b"));
  assert.notEqual(drawColors.get("a"), drawColors.get("b"));
});

test("a guest's pen tip lands on their ghost's fingertip in screen coordinates, mirrored or not", () => {
  const ghost = { x: 100, y: 200, width: 400, height: 300 };
  const output = { width: 1000, height: 800 };
  const whole = new ScreenViewport().rect(0);
  // With the whole screen showing, screen coordinates are just the output position as a fraction.
  assert.deepEqual(mapGuestPenToScreen(0.25, 0.5, { ...ghost, mirror: false }, output, whole), { x: 0.2, y: 350 / 800 });
  assert.deepEqual(mapGuestPenToScreen(0.25, 0.5, { ...ghost, mirror: true }, output, whole), { x: 0.4, y: 350 / 800 });
  assert.deepEqual(mapGuestPenToScreen(0, 0, { ...ghost, mirror: true }, output, whole), { x: 0.5, y: 0.25 });
});

test("zoom gesture messages round-trip", () => {
  assert.deepEqual(parseZoomToHost(encodePointerMessage({ t: "zoom", action: "zoom", u: 0.25, v: 0.75 })), { t: "zoom", action: "zoom", u: 0.25, v: 0.75 });
  assert.deepEqual(parseZoomToHost(encodePointerMessage({ t: "zoom", action: "pan", u: 0.1, v: 0.9 })), { t: "zoom", action: "pan", u: 0.1, v: 0.9 });
  assert.deepEqual(parseZoomToHost(encodePointerMessage({ t: "zoom", action: "reset" })), { t: "zoom", action: "reset" });
  assert.deepEqual(parseZoomToHost(encodePointerMessage({ t: "zoom-request" })), { t: "zoom-request" });
  assert.deepEqual(parseZoomToGuest(encodePointerMessage({ t: "zoom-status", status: "allowed" })), { t: "zoom-status", status: "allowed" });
});

test("malformed, out-of-range or unknown zoom messages are ignored without throwing", () => {
  for (const bad of [
    { t: "zoom" },
    { t: "zoom", action: "spin" },
    { t: "zoom", action: "zoom" },
    { t: "zoom", action: "zoom", u: 0.5 },
    { t: "zoom", action: "zoom", u: "0.5", v: 0.5 },
    { t: "zoom", action: "zoom", u: 1.5, v: 0.5 },
    { t: "zoom", action: "zoom", u: -0.1, v: 0.5 },
    { t: "pointer", u: 0.5, v: 0.5, on: true },
    { t: "zoom-status", status: "allowed" },
    [],
    "text",
    7,
    null,
  ]) {
    assert.equal(parseZoomToHost(raw(bad)), null, JSON.stringify(bad));
  }
  assert.equal(parseZoomToGuest(raw({ t: "zoom-status", status: "admin" })), null);
  assert.equal(parseZoomToGuest(raw({ t: "zoom-request" })), null);
  assert.equal(parseZoomToHost(new TextEncoder().encode("{oops")), null);
  // A reset carries no position, so extra fields on it are simply ignored rather than rejected.
  assert.deepEqual(parseZoomToHost(raw({ t: "zoom", action: "reset", u: 0.5, v: 0.5 })), { t: "zoom", action: "reset" });
});

test("a guest's pinch maps to an output-frame fraction through their ghost, mirrored or not, and clamps to 0-1", () => {
  const ghost = { x: 100, y: 200, width: 400, height: 300 };
  const output = { width: 1000, height: 1000 };
  assert.deepEqual(mapGuestZoomPoint(0.25, 0.5, { ...ghost, mirror: false }, output), { x: 0.2, y: 0.35 });
  assert.deepEqual(mapGuestZoomPoint(0.25, 0.5, { ...ghost, mirror: true }, output), { x: 0.4, y: 0.35 });
  // A ghost placed on a much smaller output would map outside 0-1; it's clamped back onto the frame.
  assert.deepEqual(mapGuestZoomPoint(0, 0, { ...ghost, mirror: false }, { width: 50, height: 50 }), { x: 1, y: 1 });
});

test("guest strokes stay on the screen content when the host zooms or pans", () => {
  const ghost = { x: 100, y: 200, width: 400, height: 300, mirror: false };
  const output = { width: 1000, height: 800 };
  const viewport = new ScreenViewport();
  const before = mapGuestPenToScreen(0.5, 0.5, ghost, output, viewport.rect(0));
  // Zoomed 2x toward the top-left: the same fingertip position now points at different screen content...
  viewport.zoomIn(0, 0, 0);
  const zoomed = mapGuestPenToScreen(0.5, 0.5, ghost, output, viewport.rect(10_000));
  assert.ok(zoomed.x < before.x && zoomed.y < before.y, "the zoomed view shows half as much, so the same spot on screen is nearer the corner");
  assert.ok(zoomed.x >= 0 && zoomed.y >= 0 && zoomed.x <= 1 && zoomed.y <= 1);
  // ...and a stroke point already on the board is stored in screen coordinates, so under the zoom it is drawn where that
  // content now appears (2x from the corner it zoomed toward), not where the fingertip was.
  const drawnZoomed = screenToOutput(viewport.rect(10_000), before.x, before.y);
  assert.ok(Math.abs(drawnZoomed.x - before.x * 2) < 1e-9 && Math.abs(drawnZoomed.y - before.y * 2) < 1e-9);
  const drawnWhole = screenToOutput(new ScreenViewport().rect(0), before.x, before.y);
  assert.ok(Math.abs(drawnWhole.x - before.x) < 1e-9 && Math.abs(drawnWhole.y - before.y) < 1e-9);
});
