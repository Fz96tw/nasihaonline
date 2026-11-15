// DB-backed integration test for managing co-hosts after an event is
// published (updateEventCoHosts) — any visibility, before the meeting
// starts. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database (same variable and
// "scratch"/"test" name guard as the other *.db.test.ts suites).
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

const url = process.env.REFLECTION_TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.slice(1) : "";
const skip = !url
  ? "set REFLECTION_TEST_DATABASE_URL to a scratch database to run"
  : !/scratch|test/i.test(dbName)
    ? `refusing to run against "${dbName}": database name must contain "scratch" or "test"`
    : false;

if (url && !skip) {
  process.env.DATABASE_URL = url;
  delete process.env.RESEND_API_KEY;
}

const HOUR = 60 * 60 * 1000;

describe("Event co-hosts (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let events: typeof import("@/lib/events-server");
  type User = Awaited<ReturnType<typeof db.user.create>>;
  let host: User;
  let alice: User;
  let bob: User;
  let unlisted: User;
  let outsider: User;
  let admin: User;
  let eventId: string;
  let manualEventId: string;
  let restrictedEventId: string;

  const rejectsWith = (promise: Promise<unknown>, status: number) =>
    assert.rejects(promise, (error: { status?: number }) => {
      assert.equal(error.status, status);
      return true;
    });

  const member = (key: string, name: string, extra: Record<string, unknown> = {}) =>
    db.user.create({
      data: {
        clerkUserId: `test_cohost_${key}`,
        email: `${key}@cohost.test`,
        name,
        role: "member",
        tier: "active",
        profile: { create: { listInDirectory: true } },
        ...extra,
      },
    });

  before(async () => {
    ({ db } = await import("@/lib/db"));
    events = await import("@/lib/events-server");

    await db.event.deleteMany({ where: { title: { startsWith: "Co-host test" } } });
    await db.notification.deleteMany({ where: { recipient: { clerkUserId: { startsWith: "test_cohost_" } } } });
    await db.user.deleteMany({ where: { clerkUserId: { startsWith: "test_cohost_" } } });

    host = await member("host", "Hana Host");
    alice = await member("alice", "Alice Aide");
    bob = await member("bob", "Bob Backup");
    outsider = await member("outsider", "Olly Outsider");
    admin = await member("admin", "Ada Admin", { role: "admin" });
    unlisted = await db.user.create({
      data: {
        clerkUserId: "test_cohost_unlisted",
        email: "unlisted@cohost.test",
        name: "Una Unlisted",
        role: "member",
        tier: "active",
        profile: { create: { listInDirectory: false } },
      },
    });

    const common = {
      type: "roundtable" as const,
      hostId: host.id,
      startsAt: new Date(Date.now() + HOUR),
      endsAt: new Date(Date.now() + 2 * HOUR),
      visibility: "community" as const,
      open: true,
      publishedAt: new Date(),
    };
    eventId = (
      await db.event.create({ data: { ...common, title: "Co-host test public event", livekitRoomName: `cohost-test-${Date.now()}` } })
    ).id;
    manualEventId = (
      await db.event.create({ data: { ...common, title: "Co-host test pasted link", meetingUrl: "https://meet.example.test/x" } })
    ).id;
    restrictedEventId = (
      await db.event.create({
        data: {
          ...common,
          open: false,
          visibility: "invited",
          title: "Co-host test restricted event",
          livekitRoomName: `cohost-test-restricted-${Date.now()}`,
          invitees: { create: [{ userId: bob.id }] },
        },
      })
    ).id;
  });

  it("lets the host add co-hosts to a published public event before the meeting", async () => {
    const result = await events.updateEventCoHosts(eventId, host, { addUserIds: [alice.id], removeUserIds: [] });
    assert.deepEqual(result.coHostUserIds, [alice.id]);
    assert.equal(result.meetingLive, false);
    assert.equal(await events.isEventCoHost(eventId, alice.id), true);
  });

  it("lets an existing co-host and an admin manage co-hosts, but not other members", async () => {
    await events.updateEventCoHosts(eventId, alice, { addUserIds: [bob.id], removeUserIds: [] });
    assert.equal(await events.isEventCoHost(eventId, bob.id), true);

    await rejectsWith(events.updateEventCoHosts(eventId, outsider, { addUserIds: [outsider.id], removeUserIds: [] }), 403);

    const result = await events.updateEventCoHosts(eventId, admin, { addUserIds: [], removeUserIds: [bob.id] });
    assert.deepEqual(result.coHostUserIds, [alice.id]);
  });

  it("skips the host and existing co-hosts, and rejects members who can't be co-hosts", async () => {
    const result = await events.updateEventCoHosts(eventId, host, { addUserIds: [host.id, alice.id], removeUserIds: [] });
    assert.deepEqual(result.coHostUserIds, [alice.id]);

    await rejectsWith(events.updateEventCoHosts(eventId, host, { addUserIds: [unlisted.id], removeUserIds: [] }), 400);
  });

  it("lists co-hosts with their names for the event page", async () => {
    const list = await events.getEventCoHosts(eventId);
    assert.deepEqual(
      list.map((coHost) => [coHost.userId, coHost.name]),
      [[alice.id, "Alice Aide"]],
    );
  });

  it("reports a live meeting so the route can update the room", async () => {
    await db.event.update({ where: { id: eventId }, data: { meetingStartedAt: new Date() } });
    const result = await events.updateEventCoHosts(eventId, host, { addUserIds: [bob.id], removeUserIds: [] });
    assert.equal(result.meetingLive, true);
    assert.deepEqual(new Set(result.coHostUserIds), new Set([alice.id, bob.id]));
  });

  it("invites a new co-host on a restricted event so they can see it, and keeps the invite on removal", async () => {
    assert.equal(await events.getMemberEventById(alice.id, restrictedEventId), null);

    await events.updateEventCoHosts(restrictedEventId, host, { addUserIds: [alice.id], removeUserIds: [] });
    assert.equal(await db.eventInvitee.count({ where: { eventId: restrictedEventId, userId: alice.id } }), 1);
    assert.equal(
      await db.notification.count({ where: { recipientId: alice.id, type: "event_invited" } }),
      1,
    );
    assert.notEqual(await events.getMemberEventById(alice.id, restrictedEventId), null);

    // A co-host adding another co-host invites them too.
    await events.updateEventCoHosts(restrictedEventId, alice, { addUserIds: [outsider.id], removeUserIds: [] });
    assert.equal(await db.eventInvitee.count({ where: { eventId: restrictedEventId, userId: outsider.id } }), 1);

    // Already-invited co-hosts aren't invited twice.
    await events.updateEventCoHosts(restrictedEventId, host, { addUserIds: [bob.id], removeUserIds: [] });
    assert.equal(await db.eventInvitee.count({ where: { eventId: restrictedEventId, userId: bob.id } }), 1);

    await events.updateEventCoHosts(restrictedEventId, host, { addUserIds: [], removeUserIds: [outsider.id] });
    assert.equal(await events.isEventCoHost(restrictedEventId, outsider.id), false);
    assert.equal(await db.eventInvitee.count({ where: { eventId: restrictedEventId, userId: outsider.id } }), 1);
  });

  it("lets co-hosts into the meeting without an RSVP, but not other invitees", async () => {
    const coHostStatus = await events.getEventMeetingStatus(restrictedEventId, alice.id);
    assert.equal(coHostStatus.isHostOrCoHost, true);

    // outsider is still invited (no longer a co-host) and hasn't RSVP'd.
    await rejectsWith(events.getEventMeetingStatus(restrictedEventId, outsider.id), 403);
  });

  it("refuses events with a pasted link, and cancelled events", async () => {
    await rejectsWith(events.updateEventCoHosts(manualEventId, host, { addUserIds: [alice.id], removeUserIds: [] }), 400);

    await db.event.update({ where: { id: eventId }, data: { cancelledAt: new Date() } });
    await rejectsWith(events.updateEventCoHosts(eventId, host, { addUserIds: [], removeUserIds: [alice.id] }), 409);
  });
});
