import { test } from "node:test";
import assert from "node:assert/strict";
import { UNNAMED, buildRoster, displayName, rosterSignature, roleOf, type ParticipantInfo } from "./participants.ts";

const person = (identity: string, over: Partial<ParticipantInfo> = {}): ParticipantInfo => ({
  identity,
  name: identity,
  isLocal: false,
  micOn: true,
  cameraOn: true,
  speaking: false,
  ...over,
});
const host = (identity = "host", over: Partial<ParticipantInfo> = {}) => person(identity, { metadata: JSON.stringify({ role: "host" }), ...over });

test("everyone is listed by name, whether their camera is on or off", () => {
  const rows = buildRoster([person("ana", { cameraOn: false }), person("bo", { cameraOn: true, micOn: false })], [], false);
  assert.deepEqual(rows.map((row) => row.name), ["ana", "bo"]);
  assert.equal(rows[0].cameraOn, false);
  assert.equal(rows[1].micOn, false);
});

test("you come first, then the host, then everyone else by name", () => {
  const rows = buildRoster(
    [person("zed"), host("h", { name: "Hana" }), person("me", { isLocal: true, name: "Mo" }), person("amy"), person("Bea")],
    [],
    false,
  );
  assert.deepEqual(rows.map((row) => row.name), ["Mo", "Hana", "amy", "Bea", "zed"]);
  assert.equal(rows[0].you, true);
  assert.equal(rows[1].host, true);
});

test("when you are the host you are one row, tagged both ways, and first", () => {
  const rows = buildRoster([person("a"), host("h", { isLocal: true, name: "Me" })], [], true);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].you, rows[0].host], [true, true]);
  assert.equal(rows[1].host, false);
});

test("someone with no name is shown as Guest", () => {
  assert.equal(displayName(undefined), UNNAMED);
  assert.equal(displayName(""), UNNAMED);
  assert.equal(displayName("   "), UNNAMED);
  assert.equal(displayName("  Ana  "), "Ana");
  const rows = buildRoster([person("x", { name: "" }), person("y", { name: undefined })], [], false);
  assert.deepEqual(rows.map((row) => row.name), [UNNAMED, UNNAMED]);
  assert.deepEqual(rows.map((row) => row.id).sort(), ["x", "y"], "ties are broken by identity, so the order is stable");
});

test("the host is read from the token's metadata; anything else is a guest", () => {
  assert.equal(roleOf(JSON.stringify({ role: "host" })), "host");
  assert.equal(roleOf(JSON.stringify({ role: "guest" })), "guest");
  for (const bad of [undefined, "", "not json", "[]", "null", "7", JSON.stringify({ role: 3 }), JSON.stringify({})]) {
    assert.equal(roleOf(bad), null, String(bad));
  }
  const rows = buildRoster([person("a", { metadata: "not json" }), person("b", { metadata: JSON.stringify({ role: "guest" }) }), host("c")], [], false);
  assert.deepEqual(rows.filter((row) => row.host).map((row) => row.id), ["c"]);
});

test("a guest can't make themselves host by calling themselves that", () => {
  const rows = buildRoster([person("sneaky", { name: "Host" })], [], false);
  assert.equal(rows[0].host, false);
});

test("lobby participants are never listed", () => {
  const rows = buildRoster(
    [person("a"), person("l", { metadata: JSON.stringify({ role: "lobby" }) }), person("lh", { metadata: JSON.stringify({ role: "lobby-host" }) })],
    [],
    true,
  );
  assert.deepEqual(rows.map((row) => row.id), ["a"]);
});

test("mic, camera and speaking follow each person's current state", () => {
  const rows = buildRoster([person("a", { micOn: false, cameraOn: false, speaking: false }), person("b", { micOn: true, cameraOn: false, speaking: true })], [], false);
  const a = rows.find((row) => row.id === "a");
  const b = rows.find((row) => row.id === "b");
  assert.deepEqual([a?.micOn, a?.cameraOn, a?.speaking], [false, false, false]);
  assert.deepEqual([b?.micOn, b?.cameraOn, b?.speaking], [true, false, true]);
});

test("on the host's view guests on the overlay are tagged, and only they", () => {
  const participants = [host("h", { isLocal: true }), person("a"), person("b"), person("c")];
  const tagged = buildRoster(participants, ["h", "a", "b"], true).filter((row) => row.onOverlay).map((row) => row.id);
  assert.deepEqual(tagged.sort(), ["a", "b"], "not the presenter, not a guest who isn't on it");
  assert.equal(buildRoster(participants, ["h", "a", "b"], false).some((row) => row.onOverlay), false, "a guest's view has no overlay tags");
});

test("the signature changes when what the list shows changes, and only then", () => {
  const base = buildRoster([person("a"), person("b")], [], false);
  assert.equal(rosterSignature(base), rosterSignature(buildRoster([person("b"), person("a")], [], false)), "input order doesn't matter");
  const changes = [
    buildRoster([person("a", { micOn: false }), person("b")], [], false),
    buildRoster([person("a", { cameraOn: false }), person("b")], [], false),
    buildRoster([person("a", { speaking: true }), person("b")], [], false),
    buildRoster([person("a", { name: "Ann" }), person("b")], [], false),
    buildRoster([person("a")], [], false),
    buildRoster([person("a"), person("b"), person("c")], [], false),
    buildRoster([person("a"), person("b")], ["a"], true),
  ];
  for (const rows of changes) assert.notEqual(rosterSignature(rows), rosterSignature(base));
});

test("a late joiner's snapshot lists everyone already there, and the count is the row count", () => {
  const rows = buildRoster([person("me", { isLocal: true }), host("h"), person("a"), person("b", { cameraOn: false })], [], false);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.id), ["me", "h", "a", "b"]);
});
