import "server-only";
import { db } from "@/lib/db";
import { NotificationType, Role } from "@/lib/generated/prisma/enums";
import { uploadAnnouncementHeroImage, getAnnouncementHeroImageUrl } from "@/lib/storage";
import { sendAnnouncementEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

/**
 * Composes and immediately broadcasts a Board Announcement (§4.10) — there's
 * no separate draft-save step in this flow, so `sentAt` is always set on
 * create. Fans out a `board_announcement` Notification + email to every real
 * member (role member/moderator/admin with a tier assigned, same filter
 * reports-server.ts uses for "recently-active members"). Deliberately skips
 * any NotificationPreference opt-out check: no other NotificationType
 * enforces opt-out yet either (that lands in a later objective), and Board
 * Announcements are specced to ignore it even once it exists.
 */
export async function createAndSendAnnouncement(
  authorId: string,
  input: {
    title: string;
    body: string;
    heroImage: File | null;
    showInFeed: boolean;
    notifyInApp: boolean;
    sendEmail: boolean;
  },
): Promise<{ id: string }> {
  let heroImageUrl: string | null = null;
  if (input.heroImage) {
    heroImageUrl = await uploadAnnouncementHeroImage(input.heroImage);
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
    },
  });

  const detailPath = `/whats-new/announcements/${announcement.id}`;

  if (input.notifyInApp || input.sendEmail) {
    const recipients = await db.user.findMany({
      where: { role: { in: [Role.member, Role.moderator, Role.admin] }, tier: { not: null } },
      select: { id: true, email: true, name: true },
    });

    if (recipients.length > 0) {
      if (input.notifyInApp) {
        await db.notification.createMany({
          data: recipients.map((recipient) => ({
            recipientId: recipient.id,
            type: NotificationType.board_announcement,
            message: `NASIHA Board sent a new announcement: "${input.title}"`,
            link: detailPath,
          })),
        });
      }

      if (input.sendEmail) {
        // Best-effort per recipient, same rationale as every other email in
        // lib/email.ts — a failed/unconfigured send must not undo the broadcast,
        // whose Announcement + Notification rows already exist by this point.
        await Promise.allSettled(
          recipients.map((recipient) =>
            sendAnnouncementEmail(recipient.email, {
              title: input.title,
              body: input.body,
              heroImageUrl: getAnnouncementHeroImageUrl(heroImageUrl)
                ? `${APP_URL}${getAnnouncementHeroImageUrl(heroImageUrl)}`
                : null,
              detailUrl: `${APP_URL}${detailPath}`,
            }),
          ),
        );
      }
    }
  }

  return { id: announcement.id };
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
 */
export async function listAnnouncementHistory(): Promise<AnnouncementHistoryItem[]> {
  const announcements = await db.announcement.findMany({
    where: { sentAt: { not: null } },
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
