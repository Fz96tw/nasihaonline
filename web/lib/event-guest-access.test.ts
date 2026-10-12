import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EVENT_DURATION_MS, GUEST_ACCESS_GRACE_MS, guestAccessEndsAt, guestAccessExpired } from "./event-guest-access.ts";

const startsAt = new Date("2026-10-01T15:00:00Z");
const endsAt = new Date("2026-10-01T16:00:00Z");
const ms = (date: Date, offset: number) => new Date(date.getTime() + offset);

test("one-off event: open through endsAt plus grace, closed after", () => {
  const event = { startsAt, endsAt, lastOccurrenceStart: startsAt };
  assert.equal(guestAccessEndsAt(event)?.toISOString(), ms(endsAt, GUEST_ACCESS_GRACE_MS).toISOString());
  assert.equal(guestAccessExpired(event, ms(startsAt, -60_000)), false);
  assert.equal(guestAccessExpired(event, ms(endsAt, GUEST_ACCESS_GRACE_MS)), false);
  assert.equal(guestAccessExpired(event, ms(endsAt, GUEST_ACCESS_GRACE_MS + 1)), true);
});

test("one-off event without endsAt uses the default duration", () => {
  const event = { startsAt, endsAt: null, lastOccurrenceStart: startsAt };
  assert.equal(
    guestAccessEndsAt(event)?.toISOString(),
    ms(startsAt, DEFAULT_EVENT_DURATION_MS + GUEST_ACCESS_GRACE_MS).toISOString(),
  );
});

test("bounded series closes after its last occurrence, not its first", () => {
  const last = new Date("2026-10-29T15:00:00Z");
  const event = { startsAt, endsAt, lastOccurrenceStart: last };
  assert.equal(guestAccessExpired(event, ms(endsAt, GUEST_ACCESS_GRACE_MS + 1)), false);
  assert.equal(guestAccessExpired(event, ms(last, 60 * 60 * 1000 + GUEST_ACCESS_GRACE_MS + 1)), true);
});

test("unbounded series never expires", () => {
  const event = { startsAt, endsAt, lastOccurrenceStart: null };
  assert.equal(guestAccessEndsAt(event), null);
  assert.equal(guestAccessExpired(event, new Date("2099-01-01T00:00:00Z")), false);
});
