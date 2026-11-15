// DB-backed integration test for Inbox group messages (PRD §4.7) —
// restricted forum threads in the hidden Group Messages forum, listed in
// the Inbox and excluded from every forum surface. Run with
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

describe("Inbox group messages (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let groups: typeof import("@/lib/inbox-groups-server");
  let inbox: typeof import("@/lib/inbox-server");
  let forums: typeof import("@/lib/forums-server");
  let feed: typeof import("@/lib/feed-server");
  type User = Awaited<ReturnType<typeof db.user.create>>;
  let author: User;
  let alice: User;
  let bob: User;
  let carol: User;
  let outsider: User;
  let friend: User;
  let groupId: string;

  const rejectsWith = (promise: Promise<unknown>, status: number) =>
    assert.rejects(promise, (error: { status?: number }) => {
      assert.equal(error.status, status);
      return true;
    });

  const member = (key: string, name: string, extra: Record<string, unknown> = {}) =>
    db.user.create({
      data: {
        clerkUserId: `test_group_${key}`,
        email: `${key}@group.test`,
        name,
        role: "member",
        tier: "active",
        profile: { create: { listInDirectory: true } },
        ...extra,
      },
    });

  const notificationsFor = (userId: string) =>
    db.notification.findMany({ where: { recipientId: userId, type: "group_message" }, orderBy: { createdAt: "asc" } });

  before(async () => {
    ({ db } = await import("@/lib/db"));
    groups = await import("@/lib/inbox-groups-server");
    inbox = await import("@/lib/inbox-server");
    forums = await import("@/lib/forums-server");
    feed = await import("@/lib/feed-server");

    await db.forumThread.deleteMany({ where: { author: { clerkUserId: { startsWith: "test_group_" } } } });
    await db.notification.deleteMany({ where: { recipient: { clerkUserId: { startsWith: "test_group_" } } } });
    await db.user.deleteMany({ where: { clerkUserId: { startsWith: "test_group_" } } });

    author = await member("author", "Amal Author");
    alice = await member("alice", "Alice Ally");
    bob = await member("bob", "Bob Buddy");
    carol = await member("carol", "Carol Colleague");
    outsider = await member("outsider", "Olly Outsider");
    friend = await member("friend", "Fay Friend", { tier: "friend" });
  });

  it("[AC:b0496a5f:ac_1] creates a group message from two or more recipients, dropping ineligible ones", async () => {
    await rejectsWith(
      groups.createGroupMessage(author.id, { recipientIds: [alice.id, friend.id], subject: "Too few", body: "Hi" }),
      400,
    );

    const { id } = await groups.createGroupMessage(author.id, {
      recipientIds: [alice.id, bob.id, friend.id, author.id],
      subject: "Group test: journal club",
      body: "Shall we meet Thursday?",
    });
    groupId = id;

    const thread = await db.forumThread.findUniqueOrThrow({
      where: { id },
      select: { isGroupMessage: true, visibility: true, forum: { select: { slug: true, active: true } }, invitees: true },
    });
    assert.equal(thread.isGroupMessage, true);
    assert.equal(thread.visibility, "invited");
    assert.equal(thread.forum.slug, "group-messages");
    assert.equal(thread.forum.active, false);
    assert.deepEqual(thread.invitees.map((invitee) => invitee.userId).sort(), [alice.id, bob.id].sort());

    const [aliceBell] = await notificationsFor(alice.id);
    assert.match(aliceBell.message, /started a group message with you/);
    assert.equal(aliceBell.link, `/inbox?item=${id}`);
    assert.equal((await notificationsFor(friend.id)).length, 0);
  });

  it("[AC:b0496a5f:ac_2] lists the group in each participant's Inbox with participants and unread state", async () => {
    const aliceItems = await inbox.getInboxList(alice.id);
    const row = aliceItems.find((item) => item.id === groupId);
    assert.ok(row && row.kind === "group_message");
    assert.equal(row.subject, "Group test: journal club");
    assert.deepEqual(row.participants.map((p) => p.id), [author.id, alice.id, bob.id]);
    assert.equal(row.unread, true);
    assert.match(row.snippet, /^Amal: Shall we meet/);

    const authorRow = (await inbox.getInboxList(author.id)).find((item) => item.id === groupId);
    assert.equal(authorRow?.unread, false, "the author's own first message isn't unread for them");
    assert.equal((await inbox.getInboxList(outsider.id)).some((item) => item.id === groupId), false);
  });

  it("[AC:b0496a5f:ac_5] counts unread group posts toward the Inbox badge and clears them when opened", async () => {
    const before = await inbox.getUnreadInboxSummaryForUser(alice.id);
    assert.equal(before.unreadCount, 1);
    assert.ok(before.items.some((item) => item.id === groupId));

    const detail = await groups.getGroupMessageThread(groupId, alice.id, false);
    assert.equal(detail.messages.length, 1);
    assert.equal(detail.canLeave, true);
    assert.equal(detail.canManageParticipants, false);

    const after = await inbox.getUnreadInboxSummaryForUser(alice.id);
    assert.equal(after.unreadCount, 0);
    const row = (await inbox.getInboxList(alice.id)).find((item) => item.id === groupId);
    assert.equal(row?.unread, false);
  });

  it("[AC:b0496a5f:ac_3] lets any participant reply, notifying the others with links into the Inbox", async () => {
    await forums.createForumPost(groupId, bob.id, { body: "Thursday works.", parentId: null, deidentificationConfirmed: false });

    const aliceBells = await notificationsFor(alice.id);
    assert.match(aliceBells[aliceBells.length - 1].message, /Bob Buddy sent a message in "Group test: journal club"/);
    assert.equal(aliceBells[aliceBells.length - 1].link, `/inbox?item=${groupId}`);
    assert.equal((await notificationsFor(bob.id)).length, 1, "the sender isn't notified of their own message");

    const aliceRow = (await inbox.getInboxList(alice.id)).find((item) => item.id === groupId);
    assert.equal(aliceRow?.unread, true);
    const bobRow = (await inbox.getInboxList(bob.id)).find((item) => item.id === groupId);
    assert.equal(bobRow?.unread, false, "posting counts as reading");

    await rejectsWith(
      forums.createForumPost(groupId, outsider.id, { body: "Let me in", parentId: null, deidentificationConfirmed: false }),
      404,
    );
    await rejectsWith(
      forums.createForumPost(groupId, outsider.id, { body: "Admin?", parentId: null, deidentificationConfirmed: false }, true),
      404,
    );
  });

  it("throttles new-message emails: once per unread stretch, and at most once per 3 hours", async () => {
    // Created → Alice and Bob were emailed ("started") and stamped. Alice has
    // since read; Bob posted. Neither should be emailed again within 3 hours.
    const now = new Date();
    const sentNow = await groups.emailGroupParticipantsAboutPost({
      threadId: groupId,
      subject: "Group test: journal club",
      senderName: "Amal Author",
      body: "Reminder",
      recipientIds: [alice.id, bob.id],
      now,
    });
    assert.deepEqual(sentNow, []);

    // Four hours on: Alice read after her last email → emailed; Bob read
    // (posted) after his last email too → emailed.
    const later = new Date(now.getTime() + 4 * HOUR);
    const sentLater = await groups.emailGroupParticipantsAboutPost({
      threadId: groupId,
      subject: "Group test: journal club",
      senderName: "Amal Author",
      body: "Reminder",
      recipientIds: [alice.id, bob.id],
      now: later,
    });
    assert.deepEqual(sentLater.sort(), [alice.id, bob.id].sort());

    // Eight hours on, nobody has opened it since → no email at all.
    const evenLater = new Date(now.getTime() + 8 * HOUR);
    const sentEvenLater = await groups.emailGroupParticipantsAboutPost({
      threadId: groupId,
      subject: "Group test: journal club",
      senderName: "Amal Author",
      body: "Reminder",
      recipientIds: [alice.id, bob.id],
      now: evenLater,
    });
    assert.deepEqual(sentEvenLater, []);

    // Opt-out of inbox_message emails covers groups too.
    await db.notificationPreference.create({ data: { userId: carol.id, type: "inbox_message", optedOut: true } });
    const sentOptedOut = await groups.emailGroupParticipantsAboutPost({
      threadId: groupId,
      subject: "Group test: journal club",
      senderName: "Amal Author",
      body: "Reminder",
      recipientIds: [carol.id],
    });
    assert.deepEqual(sentOptedOut, []);
  });

  it("[AC:b0496a5f:ac_4] never surfaces the group on forum, feed or profile surfaces, and 404s non-participants", async () => {
    assert.equal(
      (await forums.getForumCategories(alice.id)).some((forum) => forum.slug === "group-messages"),
      false,
    );
    assert.equal(await forums.getForumBySlug("group-messages", alice.id), null);
    assert.equal(await forums.getForumThreadDetail("group-messages", groupId, alice.id), null);
    assert.equal(await forums.isForumThreadPubliclyReadable(groupId), false);
    assert.equal((await forums.getMemberForumThreads(bob.id, alice.id)).some((t) => t.id === groupId), false);
    assert.equal((await forums.getTrendingForumThreads(alice.id, true, 50)).some((t) => t.id === groupId), false);

    const page = await feed.getFeedPage({ cursor: null, pageSize: 100, viewerId: alice.id });
    assert.equal(page.items.some((item) => item.id === groupId), false);

    assert.deepEqual(await groups.getGroupMessageRedirect(groupId, alice.id), {
      isGroupMessage: true,
      participantLink: `/inbox?item=${groupId}`,
    });
    assert.deepEqual(await groups.getGroupMessageRedirect(groupId, outsider.id), {
      isGroupMessage: true,
      participantLink: null,
    });
    await rejectsWith(groups.getGroupMessageThread(groupId, outsider.id, true), 404);

    const forum = await db.forum.findUniqueOrThrow({ where: { slug: "group-messages" } });
    await rejectsWith(
      forums.createForumThread(forum.id, alice.id, {
        title: "Sneaky",
        body: "x",
        deidentificationConfirmed: false,
        visibility: "community",
        invitedUserIds: [],
        categoryIds: [],
      }),
      404,
    );
  });

  it("lets the author add and remove people, and an invitee leave", async () => {
    await forums.updateForumThreadInvitees(groupId, author.id, false, { addUserIds: [carol.id], removeUserIds: [] });
    const [added] = await notificationsFor(carol.id);
    assert.match(added.message, /added you to a group message/);

    await rejectsWith(
      forums.updateForumThreadInvitees(groupId, alice.id, false, { addUserIds: [outsider.id], removeUserIds: [] }),
      403,
    );

    await groups.leaveGroupMessage(groupId, carol.id);
    assert.equal((await inbox.getInboxList(carol.id)).some((item) => item.id === groupId), false);
    await rejectsWith(groups.leaveGroupMessage(groupId, author.id), 400);

    await forums.updateForumThreadInvitees(groupId, author.id, false, { addUserIds: [], removeUserIds: [bob.id] });
    await rejectsWith(
      forums.updateForumThreadInvitees(groupId, author.id, false, { addUserIds: [], removeUserIds: [alice.id] }),
      400,
    );
  });
});
