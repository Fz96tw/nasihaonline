// DB-backed integration test for event guests (External Guests on Private
// Events initiative): restricted-event guest access, guest names, link
// expiry, member-address routing and guest → applicant referral. Run with
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// against a migrated, otherwise-disposable database (same variable and
// "scratch"/"test" name guard as the Weekly Reflection suites). Emails are
// not sent (RESEND_API_KEY unset), so invites report "failed" but still
// create the guest's registration.
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

describe("Event guests (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let events: typeof import("@/lib/events-server");
  let guests: typeof import("@/lib/event-guest-invites-server");
  let membership: typeof import("@/lib/guest-membership");
  let host: Awaited<ReturnType<typeof db.user.create>>;
  let eventId: string;
  let janeRid: string;

  const status = (rid: string | null) => events.getEventMeetingStatus(eventId, null, rid);
  const rejects = async (promise: Promise<unknown>, expected: { status: number; requiresSignIn?: boolean }) => {
    await assert.rejects(promise, (error: { status?: number; requiresSignIn?: boolean }) => {
      assert.equal(error.status, expected.status);
      if (expected.requiresSignIn !== undefined) assert.equal(error.requiresSignIn, expected.requiresSignIn);
      return true;
    });
  };

  before(async () => {
    ({ db } = await import("@/lib/db"));
    events = await import("@/lib/events-server");
    guests = await import("@/lib/event-guest-invites-server");
    membership = await import("@/lib/guest-membership");

    await db.membershipApplication.deleteMany({ where: { email: { endsWith: "@guest.test" } } });
    await db.event.deleteMany({ where: { title: { startsWith: "Guest test" } } });
    await db.notification.deleteMany({ where: { recipient: { clerkUserId: { startsWith: "test_guest_" } } } });
    await db.user.deleteMany({ where: { clerkUserId: { startsWith: "test_guest_" } } });

    host = await db.user.create({
      data: { clerkUserId: "test_guest_host", email: "host@example.test", name: "Hana Host", role: "member", tier: "active" },
    });
    await db.user.create({
      data: {
        clerkUserId: "test_guest_member",
        email: "member@example.test",
        name: "Mo Member",
        role: "member",
        tier: "active",
        profile: { create: { listInDirectory: true } },
      },
    });
    const event = await db.event.create({
      data: {
        title: "Guest test private event",
        type: "roundtable",
        hostId: host.id,
        startsAt: new Date(Date.now() + HOUR),
        endsAt: new Date(Date.now() + 2 * HOUR),
        visibility: "invited",
        meetingUrl: "https://meet.example.test/abc",
        publishedAt: new Date(),
      },
    });
    eventId = event.id;
  });

  it("invites outside addresses as guests, member addresses as invitees", async () => {
    const outcomes = await guests.inviteGuestsByEmail(eventId, host, {
      emails: ["Jane Doe <jane@guest.test>", "member@example.test", "not-an-email"],
      inviteToJoin: true,
    });
    const byEmail = Object.fromEntries(outcomes.map((outcome) => [outcome.email, outcome.status]));
    assert.equal(byEmail["jane@guest.test"], "failed"); // email not sent in tests, registration still made
    assert.equal(byEmail["member@example.test"], "member_invited");
    assert.equal(byEmail["not-an-email"], "invalid");

    const jane = await db.eventRegistration.findFirstOrThrow({ where: { eventId, email: "jane@guest.test" } });
    assert.equal(jane.name, "Jane Doe");
    assert.equal(jane.source, "invited");
    assert.equal(jane.inviteToJoin, true);
    janeRid = jane.id;
    assert.equal(await db.eventInvitee.count({ where: { eventId } }), 1);
  });

  it("never offers the shareable link on a restricted event", async () => {
    await rejects(guests.enableGuestLink(eventId, host, { regenerate: false }), { status: 400 });
    assert.equal((await guests.getGuestLinkState(eventId, host)).linkAvailable, false);
  });

  it("admits an invited guest anonymously, by name, behind the Code of Conduct", async () => {
    const first = await status(janeRid);
    assert.equal(first.guestName, "Jane Doe (guest)");
    assert.deepEqual(first.guestNamePrompt, { suggestedName: "Jane Doe" });
    assert.equal(first.requiresCodeOfConductAgreement, true);
    const second = await status(janeRid);
    assert.equal(second.guestNamePrompt, null);

    await events.setEventGuestName(eventId, janeRid, "Jane D.");
    assert.equal((await status(janeRid)).guestName, "Jane D. (guest)");
  });

  it("sends anyone else on a restricted event to sign in", async () => {
    await rejects(status(null), { status: 403, requiresSignIn: true });
    const publicRow = await db.eventRegistration.create({ data: { eventId, email: "walkin@guest.test" } });
    await rejects(status(publicRow.id), { status: 403, requiresSignIn: true });
  });

  it("records the referral and stops inviting once they've applied", async () => {
    assert.match((await membership.guestJoinInviteUrlFor(janeRid)) ?? "", /\/join\?gi=/);
    assert.deepEqual(await membership.resolveGuestReferral(janeRid), {
      referredByUserId: host.id,
      referredViaEventId: eventId,
    });
    assert.deepEqual(await membership.resolveGuestReferral("nope"), {});
    const prefill = await membership.getGuestJoinPrefill(janeRid);
    assert.equal(prefill?.firstName, "Jane");
    assert.equal(prefill?.referrerName, "Hana Host");

    await db.membershipApplication.create({
      data: {
        firstName: "Jane",
        lastName: "D.",
        email: "jane@guest.test",
        countryRegion: "Nowhere",
        availability: [],
        codeOfConductAcceptedAt: new Date(),
        referredByUserId: host.id,
        referredViaEventId: eventId,
      },
    });
    assert.equal(await membership.guestJoinInviteUrlFor(janeRid), null);
  });

  it("stops admitting the guest after the event plus grace", async () => {
    await db.event.update({
      where: { id: eventId },
      data: { startsAt: new Date(Date.now() - 5 * HOUR), endsAt: new Date(Date.now() - 4 * HOUR) },
    });
    await rejects(status(janeRid), { status: 410 });
  });

  it("keeps a draft's external guests until publish, then clears them", async () => {
    const base = {
      title: "Guest test draft",
      description: null,
      type: "roundtable" as const,
      startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
      endsAt: null,
      open: false,
      guestLinkEnabled: false,
      meetingUrl: "https://meet.example.test/draft",
      deidentificationConfirmed: false,
      timezone: "UTC",
      heroImage: null,
      visibility: "invited" as const,
      invitedUserIds: [],
      externalGuests: "Sam Guest <sam@guest.test>",
      coHostUserIds: [],
      communityIds: [],
      categoryIds: [],
      meetLinkSource: "manual" as const,
      meetingOrganizerMessage: null,
      meetingOrganizerMessageImage: null,
      recurrence: null,
    };
    const draft = await events.createEvent(host.id, base, "draft");
    assert.equal((await events.getEventForEdit(draft.id))?.externalGuests, "Sam Guest <sam@guest.test>");
    assert.equal(await db.eventRegistration.count({ where: { eventId: draft.id } }), 0);

    await events.saveEventDraft(draft.id, host, { ...base, externalGuests: "sam@guest.test, kim@guest.test" });
    assert.equal((await events.getEventForEdit(draft.id))?.externalGuests, "sam@guest.test, kim@guest.test");
    assert.equal(await db.eventRegistration.count({ where: { eventId: draft.id } }), 0);

    await events.publishEventDraft(draft.id, host, { ...base, externalGuests: "sam@guest.test, kim@guest.test" });
    assert.equal((await events.getEventForEdit(draft.id))?.externalGuests, "");
    // What the publish route does next (inviteExternalGuestsOnPublish).
    await guests.inviteExternalGuestsOnPublish(draft.id, host, "sam@guest.test, kim@guest.test");
    assert.equal(await db.eventRegistration.count({ where: { eventId: draft.id, source: "invited" } }), 2);
  });

  it("emails a public event's guests without the shareable link, and keeps a public draft's list", async () => {
    const publicEvent = await db.event.create({
      data: {
        title: "Guest test public event",
        type: "webinar",
        hostId: host.id,
        startsAt: new Date(Date.now() + HOUR),
        open: true,
        meetingUrl: "https://meet.example.test/pub",
        publishedAt: new Date(),
      },
    });
    assert.equal(publicEvent.guestLinkToken, null);
    await guests.inviteGuestsByEmail(publicEvent.id, host, { emails: ["pat@guest.test"] });
    assert.equal(await db.eventRegistration.count({ where: { eventId: publicEvent.id, source: "invited" } }), 1);
    assert.equal((await guests.getGuestLinkState(publicEvent.id, host)).linkAvailable, true);

    const draft = await events.createEvent(
      host.id,
      {
        title: "Guest test public draft",
        description: null,
        type: "webinar",
        startsAt: new Date(Date.now() + 24 * HOUR).toISOString(),
        endsAt: null,
        open: true,
        guestLinkEnabled: false,
        meetingUrl: "https://meet.example.test/pubdraft",
        deidentificationConfirmed: false,
        timezone: "UTC",
        heroImage: null,
        visibility: "community",
        invitedUserIds: [],
        externalGuests: "lee@guest.test",
        coHostUserIds: [],
        communityIds: [],
        categoryIds: [],
        meetLinkSource: "manual",
        meetingOrganizerMessage: null,
        meetingOrganizerMessageImage: null,
        recurrence: null,
      },
      "draft",
    );
    assert.equal((await events.getEventForEdit(draft.id))?.externalGuests, "lee@guest.test");
  });

  it("withdraws a removed guest: link rejected, one cancellation email", async () => {
    await db.event.update({
      where: { id: eventId },
      data: { startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 2 * HOUR) },
    });
    // With RESEND_API_KEY unset every send is logged as skipped — count those.
    const skipped: string[] = [];
    const warn = console.warn;
    console.warn = (message: unknown) => void skipped.push(String(message));
    try {
      await guests.revokeGuest(eventId, host, janeRid);
      await guests.revokeGuest(eventId, host, janeRid); // already removed: no second email
    } finally {
      console.warn = warn;
    }
    assert.equal(skipped.filter((line) => line.includes("lifecycle email to jane@guest.test")).length, 1);
    await rejects(status(janeRid), { status: 403 });

    // The invitation and the cancellation are the same calendar entry.
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
    const fields = { ...event, livekitRoomName: null };
    const invite = events.buildEventInviteAttachment(fields, "REQUEST", { email: "jane@guest.test", name: null });
    const cancel = events.buildEventInviteAttachment(fields, "CANCEL", { email: "jane@guest.test", name: null });
    assert.match(invite.content, /METHOD:REQUEST/);
    assert.match(cancel.content, /METHOD:CANCEL/);
    const uid = (ics: string) => /UID:(.+)/.exec(ics)?.[1];
    assert.equal(uid(invite.content), uid(cancel.content));
  });

  it("leaves a Meet-backed private event's removals to Google", async () => {
    await db.event.update({ where: { id: eventId }, data: { googleEventId: "google-test" } });
    const kim = await db.eventRegistration.create({
      data: { eventId, email: "kim@guest.test", source: "invited", invitedById: host.id, invitedAt: new Date() },
    });
    const skipped: string[] = [];
    const warn = console.warn;
    console.warn = (message: unknown) => void skipped.push(String(message));
    try {
      await guests.revokeGuest(eventId, host, kim.id);
    } finally {
      console.warn = warn;
    }
    assert.equal(skipped.filter((line) => line.includes("kim@guest.test")).length, 0);
  });
});
