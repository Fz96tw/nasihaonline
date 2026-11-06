// DB-backed test: the welcome-new-member Announcement is hidden from the
// member it welcomes (feed, bell, email) but still reaches everyone else.
// Same safety rules as the other .db.test.ts files: runs only against a
// scratch/test database, e.g.
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const url = process.env.REFLECTION_TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.slice(1) : "";
const skip = !url
  ? "set REFLECTION_TEST_DATABASE_URL to a scratch database to run"
  : !/scratch|test/i.test(dbName)
    ? `refusing to run against "${dbName}": database name must contain "scratch" or "test"`
    : false;

if (url && !skip) {
  process.env.DATABASE_URL = url;
  // With no Resend key, sendAnnouncementEmail logs each skipped recipient —
  // that log line is how this test observes who would have been emailed.
  delete process.env.RESEND_API_KEY;
}

describe("Welcome announcement is hidden from its own subject (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let getFeedPage: typeof import("@/lib/feed-server").getFeedPage;

  const suffix = Date.now();
  let newMemberId: string;
  let otherMemberId: string;
  let announcementId: string;
  let regularAnnouncementId: string;
  const emailedTo: string[] = [];
  const originalWarn = console.warn;

  const feedAnnouncementIds = async (viewerId: string) => {
    const page = await getFeedPage({ cursor: null, pageSize: 50, types: ["announcement"], viewerId });
    return page.items.map((item) => item.id);
  };

  before(async () => {
    ({ db } = await import("@/lib/db"));
    ({ getFeedPage } = await import("@/lib/feed-server"));
    const { sendWelcomeAnnouncement } = await import("@/lib/welcome-announcement");
    const { createAndSendAnnouncement } = await import("@/lib/announcements-server");
    const { setWelcomeAnnouncementSettings, getBroadcastEmailSettings, setBroadcastEmailSettings } = await import("@/lib/settings");

    await setWelcomeAnnouncementSettings({
      welcomeAnnouncementInFeed: true,
      welcomeAnnouncementNotify: true,
      welcomeAnnouncementEmail: true,
    });
    await setBroadcastEmailSettings({ ...(await getBroadcastEmailSettings()), announcementEmailEnabled: true });

    const user = (key: string, role: "admin" | "member") =>
      db.user.create({
        data: { clerkUserId: `test_welcome_${key}_${suffix}`, email: `welcome-${key}-${suffix}@example.test`, name: `Test ${key}`, role, tier: "active" },
      });
    const admin = await user("admin", "admin");
    const newMember = await user("new", "member");
    const otherMember = await user("other", "member");
    newMemberId = newMember.id;
    otherMemberId = otherMember.id;

    console.warn = (...args: unknown[]) => {
      const match = String(args[0]).match(/skipping announcement email to (\S+)/);
      if (match) emailedTo.push(match[1]);
      else originalWarn(...args);
    };
    try {
      await sendWelcomeAnnouncement(newMember);
      const regular = await createAndSendAnnouncement(admin.id, {
        title: `Regular ${suffix}`,
        body: "Board news",
        heroImage: null,
        showInFeed: true,
        notifyInApp: true,
        sendEmail: true,
      });
      regularAnnouncementId = regular.id;
    } finally {
      console.warn = originalWarn;
    }

    const welcome = await db.announcement.findFirstOrThrow({ where: { welcomeSubjectId: newMemberId } });
    announcementId = welcome.id;
  });

  after(async () => {
    await db?.$disconnect();
  });

  it("[AC:a28bcc71:ac_4] records the welcomed member on the welcome row and leaves other announcements null", async () => {
    const welcome = await db.announcement.findUniqueOrThrow({ where: { id: announcementId } });
    assert.equal(welcome.welcomeSubjectId, newMemberId);
    const regular = await db.announcement.findUniqueOrThrow({ where: { id: regularAnnouncementId } });
    assert.equal(regular.welcomeSubjectId, null);
  });

  it("[AC:a28bcc71:ac_1] hides the welcome post from the new member's own feed", async () => {
    const ids = await feedAnnouncementIds(newMemberId);
    assert.ok(!ids.includes(announcementId), "new member should not see their own welcome");
    assert.ok(ids.includes(regularAnnouncementId), "new member should still see other announcements");
  });

  it("[AC:a28bcc71:ac_2] still shows the welcome post to other members", async () => {
    const ids = await feedAnnouncementIds(otherMemberId);
    assert.ok(ids.includes(announcementId));
  });

  it("[AC:a28bcc71:ac_3] skips the new member's bell notification and email but not other members'", async () => {
    const link = `/whats-new/announcements/${announcementId}`;
    const notified = await db.notification.findMany({ where: { link }, select: { recipientId: true } });
    const recipientIds = notified.map((n) => n.recipientId);
    assert.ok(!recipientIds.includes(newMemberId), "new member should get no bell notification");
    assert.ok(recipientIds.includes(otherMemberId), "other member should get a bell notification");

    const newEmail = `welcome-new-${suffix}@example.test`;
    const otherEmail = `welcome-other-${suffix}@example.test`;
    // Two sends ran (welcome + regular): the new member is emailed only for the regular one.
    assert.equal(emailedTo.filter((to) => to === newEmail).length, 1);
    assert.equal(emailedTo.filter((to) => to === otherEmail).length, 2);
  });
});
