// No "server-only" guard: the weekly-digest job (scripts/worker.ts, outside
// Next's server runtime) creates and publishes announcements through this
// module. lib/storage.ts does carry the guard, so it's only ever loaded
// lazily, in the paths that actually have a cover image — never for a digest.
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { NotificationType, Role, type Tier } from "@/lib/generated/prisma/enums";
import { sendAnnouncementEmail } from "@/lib/email";
import { getBroadcastEmailSettings } from "@/lib/settings";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

/**
 * Composes and immediately broadcasts a Board Announcement (§4.10) — `sentAt`
 * is always set on create here. To stage one for approval instead, use
 * createAnnouncementDraft + publishAnnouncementDraft below. Fans out a `board_announcement` Notification + email to every real
 * member (role member/moderator/admin with a tier assigned, same filter
 * reports-server.ts uses for "recently-active members"). Deliberately skips
 * any NotificationPreference opt-out check: no other NotificationType
 * enforces opt-out yet either (that lands in a later objective), and Board
 * Announcements are specced to ignore it even once it exists.
 *
 * The email leg is additionally gated on SiteSettings.announcementEmailEnabled
 * (/admin/email-notifications) — a site-wide kill switch, off by default,
 * separate from `input.sendEmail`'s per-send checkbox. `input.sendEmail` is
 * still stored on the Announcement row as the composer's stated intent even
 * when the global switch suppresses the actual send, so history stays an
 * honest record of what was chosen versus what the switch allowed through.
 *
 * `templateHeroImageUrl` supports "use as template" resends: when the admin
 * didn't pick a new file, the new Announcement reuses a prior announcement's
 * already-uploaded MinIO object key instead of requiring a re-upload (those
 * objects are immutable and never deleted). A new `heroImage` file always
 * takes priority over it.
 */
export async function createAndSendAnnouncement(
  authorId: string,
  input: {
    title: string;
    body: string;
    heroImage: File | null;
    templateHeroImageUrl?: string | null;
    showInFeed: boolean;
    notifyInApp: boolean;
    sendEmail: boolean;
    /** Set only by the welcome-new-member send (lib/welcome-announcement.ts) — renders as a tier badge after the name in the title. */
    welcomeTier?: Tier | null;
  },
): Promise<{ id: string }> {
  let heroImageUrl: string | null = input.templateHeroImageUrl ?? null;
  if (input.heroImage) {
    heroImageUrl = await (await import("@/lib/storage")).uploadAnnouncementHeroImage(input.heroImage);
  }

  const announcement = await db.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      authorId,
      heroImageUrl,
      showInFeed: input.showInFeed,
      notifyInApp: input.notifyInApp,
      sendEmail: input.sendEmail,
      sentAt: new Date(),
      welcomeTier: input.welcomeTier ?? null,
    },
  });

  await deliverAnnouncement({
    id: announcement.id,
    title: input.title,
    body: input.body,
    heroImageUrl,
    notifyInApp: input.notifyInApp,
    sendEmail: input.sendEmail,
  });

  return { id: announcement.id };
}

type DeliverableAnnouncement = {
  id: string;
  title: string;
  body: string;
  heroImageUrl: string | null;
  notifyInApp: boolean;
  sendEmail: boolean;
};

/**
 * The fan-out half of sending an Announcement — bell notifications and
 * emails to every real member. Shared by createAndSendAnnouncement (send now)
 * and publishAnnouncementDraft (approve a draft), so both honor the same
 * channel toggles and the same global email kill switch. The feed leg needs
 * no work here: it's driven by sentAt/showInFeed on the row itself.
 */
async function deliverAnnouncement(announcement: DeliverableAnnouncement): Promise<void> {
  const heroDisplayUrl = announcement.heroImageUrl
    ? (await import("@/lib/storage")).getAnnouncementHeroImageUrl(announcement.heroImageUrl)
    : null;
  const detailPath = `/whats-new/announcements/${announcement.id}`;
  const emailGloballyEnabled = (await getBroadcastEmailSettings()).announcementEmailEnabled;
  const shouldEmail = announcement.sendEmail && emailGloballyEnabled;

  if (announcement.notifyInApp || shouldEmail) {
    const recipients = await db.user.findMany({
      where: { role: { in: [Role.member, Role.moderator, Role.admin] }, tier: { not: null } },
      select: { id: true, email: true, name: true },
    });

    if (recipients.length > 0) {
      if (announcement.notifyInApp) {
        await db.notification.createMany({
          data: recipients.map((recipient) => ({
            recipientId: recipient.id,
            type: NotificationType.board_announcement,
            message: `NASIHA Board sent a new announcement: "${announcement.title}"`,
            link: detailPath,
          })),
        });
      }

      if (shouldEmail) {
        // Best-effort per recipient, same rationale as every other email in
        // lib/email.ts — a failed/unconfigured send must not undo the broadcast,
        // whose Announcement + Notification rows already exist by this point.
        await Promise.allSettled(
          recipients.map((recipient) =>
            sendAnnouncementEmail(recipient.email, {
              title: announcement.title,
              body: announcement.body,
              heroImageUrl: heroDisplayUrl ? `${APP_URL}${heroDisplayUrl}` : null,
              detailUrl: `${APP_URL}${detailPath}`,
            }),
          ),
        );
      }
    }
  }
}

export type AnnouncementTemplate = {
  title: string;
  body: string;
  heroImageUrl: string | null;
};

/**
 * Fetches a past (live or retracted) Announcement's content to pre-fill the
 * compose form for a "use as template" resend (?fromId=<id>). Returns null
 * for a missing/invalid id so the caller can fall back to a blank form
 * rather than erroring — same graceful-fallback shape as an unrecognized
 * query param anywhere else in the app.
 */
export async function getAnnouncementTemplate(id: string): Promise<AnnouncementTemplate | null> {
  const announcement = await db.announcement.findUnique({
    where: { id },
    select: { title: true, body: true, heroImageUrl: true },
  });
  return announcement;
}

export class AnnouncementError extends Error {
  constructor(
    public readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Retracts a sent Announcement: hides it from the member feed/detail page
 * (lib/feed-server.ts filters on retractedAt: null) and deletes its
 * Notification rows, so it disappears from the bell for anyone who hasn't
 * read it yet too. Can't un-send the email that already went out, and the
 * Announcement row itself is kept (retracted, not deleted) so
 * listAnnouncementHistory retains an audit trail of who retracted it and
 * when.
 */
export async function retractAnnouncement(id: string, retractedById: string): Promise<void> {
  const announcement = await db.announcement.findUnique({
    where: { id },
    select: { sentAt: true, retractedAt: true },
  });
  if (!announcement || !announcement.sentAt) {
    throw new AnnouncementError(404, "Announcement not found.");
  }
  if (announcement.retractedAt) {
    throw new AnnouncementError(409, "This announcement has already been retracted.");
  }

  await db.$transaction([
    db.announcement.update({
      where: { id },
      data: { retractedAt: new Date(), retractedById },
    }),
    db.notification.deleteMany({
      where: { type: NotificationType.board_announcement, link: `/whats-new/announcements/${id}` },
    }),
  ]);
}

export type AnnouncementHistoryItem = {
  id: string;
  title: string;
  sentAt: string;
  authorName: string;
  retractedAt: string | null;
  retractedByName: string | null;
  showInFeed: boolean;
  notifyInApp: boolean;
  sendEmail: boolean;
};

/**
 * Past Announcements with the real sending admin's name, unmasked — the
 * Board's internal record. Distinct from the member-facing feed/detail page,
 * which display the fixed "NASIHA Board" identity instead (lib/feed-server.ts).
 * Includes retracted announcements (with who/when) so the record persists
 * even once an announcement is hidden from members.
 * Excludes auto-generated welcome-new-member posts (welcomeTier set) — this
 * is a record of infrequent, high-signal Board sends, and welcome shout-outs
 * would swamp it. They're still visible via the feed/notifications/email,
 * and their channels are configurable from the welcome-announcement settings.
 */
export async function listAnnouncementHistory(): Promise<AnnouncementHistoryItem[]> {
  const announcements = await db.announcement.findMany({
    where: { sentAt: { not: null }, welcomeTier: null },
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      title: true,
      sentAt: true,
      author: { select: { name: true } },
      retractedAt: true,
      retractedBy: { select: { name: true } },
      showInFeed: true,
      notifyInApp: true,
      sendEmail: true,
    },
  });

  return announcements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    // sentAt is never null here — the where clause above excludes drafts.
    sentAt: (announcement.sentAt as Date).toISOString(),
    authorName: announcement.author.name ?? "NASIHA Member",
    retractedAt: announcement.retractedAt?.toISOString() ?? null,
    retractedByName: announcement.retractedBy?.name ?? null,
    showInFeed: announcement.showInFeed,
    notifyInApp: announcement.notifyInApp,
    sendEmail: announcement.sendEmail,
  }));
}

const TRENDING_WINDOW_DAYS = 30;

/** Dashboard "What's Trending" — feed-visible announcements last updated in the last 30 days (no view-tracking exists for this model). */
export async function getTrendingAnnouncements(
  limit = 3,
): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const announcements = await db.announcement.findMany({
    where: { sentAt: { not: null }, retractedAt: null, showInFeed: true, updatedAt: { gte: since } },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return announcements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    updatedAt: announcement.updatedAt.toISOString(),
  }));
}

export type AnnouncementDraftInput = {
  title: string;
  body: string;
  showInFeed: boolean;
  notifyInApp: boolean;
  sendEmail: boolean;
};

/**
 * Stages an unsent Announcement (`sentAt` null) for an admin to review. A
 * draft notifies nobody and is invisible everywhere members can look: the
 * feed, the detail page (getSentAnnouncement) and the search index all
 * already require `sentAt` to be set. The weekly digest job uses this too.
 */
export async function createAnnouncementDraft(
  authorId: string,
  input: AnnouncementDraftInput & {
    heroImage?: File | null;
    templateHeroImageUrl?: string | null;
    /** Weekly digests only — see Announcement.digestPeriodEnd. */
    digestPeriodEnd?: Date;
    /** Weekly digests only — see Announcement.digestHighlights. */
    digestHighlights?: Prisma.InputJsonValue;
  },
): Promise<{ id: string }> {
  let heroImageUrl: string | null = input.templateHeroImageUrl ?? null;
  if (input.heroImage) {
    heroImageUrl = await (await import("@/lib/storage")).uploadAnnouncementHeroImage(input.heroImage);
  }

  const draft = await db.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      authorId,
      heroImageUrl,
      showInFeed: input.showInFeed,
      notifyInApp: input.notifyInApp,
      sendEmail: input.sendEmail,
      sentAt: null,
      digestPeriodEnd: input.digestPeriodEnd ?? null,
      ...(input.digestHighlights ? { digestHighlights: input.digestHighlights } : {}),
    },
  });
  return { id: draft.id };
}

export type AnnouncementDraft = AnnouncementDraftInput & {
  id: string;
  authorName: string;
  createdAt: string;
};

const DRAFT_SELECT = {
  id: true,
  title: true,
  body: true,
  showInFeed: true,
  notifyInApp: true,
  sendEmail: true,
  createdAt: true,
  author: { select: { name: true } },
} as const;

function toDraft(row: {
  id: string;
  title: string;
  body: string;
  showInFeed: boolean;
  notifyInApp: boolean;
  sendEmail: boolean;
  createdAt: Date;
  author: { name: string | null };
}): AnnouncementDraft {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    showInFeed: row.showInFeed,
    notifyInApp: row.notifyInApp,
    sendEmail: row.sendEmail,
    authorName: row.author.name ?? "NASIHA Member",
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAnnouncementDrafts(): Promise<AnnouncementDraft[]> {
  const drafts = await db.announcement.findMany({
    where: { sentAt: null, retractedAt: null, welcomeTier: null },
    orderBy: { createdAt: "desc" },
    select: DRAFT_SELECT,
  });
  return drafts.map(toDraft);
}

export async function getAnnouncementDraft(id: string): Promise<AnnouncementDraft | null> {
  const draft = await db.announcement.findFirst({
    where: { id, sentAt: null, retractedAt: null },
    select: DRAFT_SELECT,
  });
  return draft ? toDraft(draft) : null;
}

/** Throws 404 when `id` doesn't exist, 409 when it does but is already sent (no longer a draft). */
async function draftNotAvailable(id: string): Promise<AnnouncementError> {
  const exists = await db.announcement.findUnique({ where: { id }, select: { id: true } });
  return exists
    ? new AnnouncementError(409, "This announcement has already been published.")
    : new AnnouncementError(404, "Draft not found.");
}

export async function updateAnnouncementDraft(id: string, input: AnnouncementDraftInput): Promise<void> {
  const result = await db.announcement.updateMany({ where: { id, sentAt: null }, data: input });
  if (result.count === 0) throw await draftNotAvailable(id);
}

export async function discardAnnouncementDraft(id: string): Promise<void> {
  const result = await db.announcement.deleteMany({ where: { id, sentAt: null } });
  if (result.count === 0) throw await draftNotAvailable(id);
}

/**
 * Approves a draft: stamps `sentAt` and runs the normal fan-out per the
 * draft's own channel toggles (and the global email switch). The stamp is an
 * atomic `updateMany ... where sentAt is null`, so a double-click or two
 * admins publishing at once can only ever win once — the loser gets a 409
 * and no second round of notifications/emails goes out.
 */
export async function publishAnnouncementDraft(id: string): Promise<void> {
  const draft = await db.announcement.findFirst({
    where: { id, sentAt: null },
    select: { id: true, title: true, body: true, heroImageUrl: true, notifyInApp: true, sendEmail: true },
  });
  if (!draft) throw await draftNotAvailable(id);

  const claimed = await db.announcement.updateMany({
    where: { id, sentAt: null },
    data: { sentAt: new Date() },
  });
  if (claimed.count === 0) throw await draftNotAvailable(id);

  await deliverAnnouncement(draft);
}
