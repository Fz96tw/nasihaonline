import { test } from "node:test";
import assert from "node:assert/strict";
import { guestDisplayName, parseGuestAddress, splitGuestAddresses } from "./guest-address.ts";

test("parses a bare address", () => {
  assert.deepEqual(parseGuestAddress(" jane@example.com "), { email: "jane@example.com", name: null });
});

test("parses Name <email>, including quoted names", () => {
  assert.deepEqual(parseGuestAddress("Jane Doe <jane@example.com>"), { email: "jane@example.com", name: "Jane Doe" });
  assert.deepEqual(parseGuestAddress('"Doe, Jane" <jane@example.com>'), { email: "jane@example.com", name: "Doe, Jane" });
  assert.deepEqual(parseGuestAddress("<jane@example.com>"), { email: "jane@example.com", name: null });
});

test("splits mixed input without breaking named entries", () => {
  assert.deepEqual(splitGuestAddresses("a@x.com b@y.com\nJane Doe <jane@example.com>; c@z.com"), [
    "a@x.com",
    "b@y.com",
    "Jane Doe <jane@example.com>",
    "c@z.com",
  ]);
});

test("display name never includes an email", () => {
  assert.equal(guestDisplayName("Jane Doe"), "Jane Doe (guest)");
  assert.equal(guestDisplayName(null), "Guest");
  assert.equal(guestDisplayName("  "), "Guest");
});
