import "server-only";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { createAndSendAnnouncement } from "@/lib/announcements-server";
import { getWelcomeAnnouncementSettings } from "@/lib/settings";
import { DIRECTORY_TIERS } from "@/lib/members";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

/**
 * Posts the community welcome shout-out for a member's first sign-in.
 * All-channels-off means the admin has disabled the whole feature — skip
 * creating an Announcement at all rather than leaving an invisible row.
 */
export async function sendWelcomeAnnouncement(newUser: UserModel): Promise<void> {
  const settings = await getWelcomeAnnouncementSettings();
  if (
    !settings.welcomeAnnouncementInFeed &&
    !settings.welcomeAnnouncementNotify &&
    !settings.welcomeAnnouncementEmail
  ) {
    return;
  }

  const author = await db.user.findFirst({
    where: { role: Role.admin },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!author) return;

  const displayName = newUser.name?.trim() || "a new member";

  // Only link to the Directory if the new member is actually visible there
  // (Friend tier isn't Directory-eligible at all, and listInDirectory is a
  // member-controlled opt-out) — otherwise the profile page would 404.
  const profile = await db.profile.findUnique({
    where: { userId: newUser.id },
    select: { listInDirectory: true },
  });
  const isDirectoryVisible =
    !!newUser.tier && DIRECTORY_TIERS.includes(newUser.tier) && profile?.listInDirectory !== false;

  const directoryLink =
    isDirectoryVisible && APP_URL
      ? `\n\n[Say hello to ${displayName} in the Member Directory](${APP_URL}/members/${newUser.id})`
      : "";

  await createAndSendAnnouncement(author.id, {
    title: "Welcome our newest member!",
    body: `Please join us in welcoming ${displayName} to the Nasiha community! We're glad you're here — take a moment to say hello.${directoryLink}`,
    heroImage: null,
    templateHeroImageUrl: null,
    showInFeed: settings.welcomeAnnouncementInFeed,
    notifyInApp: settings.welcomeAnnouncementNotify,
    sendEmail: settings.welcomeAnnouncementEmail,
  });
}
