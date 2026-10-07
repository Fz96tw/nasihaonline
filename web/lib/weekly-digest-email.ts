// No "server-only" guard: imported by lib/weekly-digest-job.ts, which
// scripts/worker.ts runs outside Next's server runtime — same convention as
// lib/inbox-reminders.ts.
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import { getWeeklyDigestSettings } from "@/lib/settings";
import { sendWeeklyDigestTeaserEmail, type WeeklyDigestTeaserEmail } from "@/lib/email";
import type { WeeklyDigest } from "@/lib/weekly-digest-compose";

type Highlights = WeeklyDigest["highlights"];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Resend allows ~2 requests/second; stay safely under it between real sends. */
const SEND_SPACING_MS = 600;
/** A published digest older than this that never got its teaser sent is left alone. */
const PENDING_TEASER_MAX_AGE_MS = 7 * DAY_MS;

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function firstNameOf(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "there";
}

/** Fills {firstName} in admin-edited text, case-insensitively and everywhere it appears. */
export function personalize(text: string, firstName: string): string {
  return text.replace(/\{firstName\}/gi, firstName);
}

/** Headline lines for the email — only categories with something to report. */
export function highlightLines(h: Highlights): string[] {
  const lines: string[] = [];
  if (h.newMembers > 0) lines.push(`${plural(h.newMembers, "new member joined", "new members joined")}`);
  if (h.libraryTotal > 0) lines.push(plural(h.libraryTotal, "new library resource", "new library resources"));
  if (h.eventsTotal > 0) lines.push(plural(h.eventsTotal, "upcoming event", "upcoming events"));
  if (h.forumThreadsTotal > 0) lines.push(plural(h.forumThreadsTotal, "new forum thread", "new forum threads"));
  if (h.peerReviewsStarted > 0) lines.push(plural(h.peerReviewsStarted, "peer review started", "peer reviews started"));
  if (h.replies > 0) lines.push(plural(h.replies, "reply across the community", "replies across the community"));
  if (h.knowledgeHoursThisWeek > 0) {
    lines.push(`${Number(h.knowledgeHoursThisWeek.toFixed(1)).toLocaleString("en-US")} Knowledge Hours earned`);
  }
  return lines;
}

/** Builds one recipient's email from the admin-edited subject/intro and the digest's highlights. */
export function buildTeaserEmail(
  settings: { weeklyDigestEmailSubject: string; weeklyDigestEmailIntro: string },
  highlights: Highlights,
  recipient: { name: string | null },
  urls: { digestUrl: string; unsubscribeUrl: string },
): WeeklyDigestTeaserEmail {
  const firstName = firstNameOf(recipient.name);
  const titles = highlights.publicTitles.slice(0, 3);
  return {
    subject: personalize(settings.weeklyDigestEmailSubject, firstName),
    introParagraphs: personalize(settings.weeklyDigestEmailIntro, firstName)
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    highlightLines: highlightLines(highlights),
    titlesLine: titles.length > 0 ? `A few things worth a look: ${titles.join("; ")}.` : null,
    visitUrl: APP_URL() || "/",
    digestUrl: urls.digestUrl,
    unsubscribeUrl: urls.unsubscribeUrl,
  };
}

export type TeaserSendResult = {
  status: "sent" | "disabled" | "not-a-published-digest" | "already-sent";
  eligible: number;
  sent: number;
  failed: number;
};

type Sender = (to: string, email: WeeklyDigestTeaserEmail) => Promise<boolean>;

/**
 * Emails the "we've missed you" teaser for one published weekly digest to
 * members who have been inactive. A member is eligible when they are a real
 * member, have signed in before (lastActiveAt set) but not within the
 * configured number of days, haven't unsubscribed, and haven't already been
 * emailed `weeklyDigestMaxEmailsPerMember` digests without coming back — a
 * member whose lastActiveAt is newer than their last digest email has
 * returned, so their count starts over.
 *
 * The digest is claimed (`digestEmailsSentAt`, compare-and-set) before any
 * sending so it is only ever emailed once. Sends are sequential and
 * best-effort: one recipient's failure is counted and logged, never blocks the
 * rest, and doesn't count toward that member's cap.
 */
export async function sendDigestTeaserEmails(
  announcementId: string,
  options: { now?: Date; send?: Sender; spacingMs?: number } = {},
): Promise<TeaserSendResult> {
  const now = options.now ?? new Date();
  const send = options.send ?? sendWeeklyDigestTeaserEmail;
  const spacingMs = options.spacingMs ?? SEND_SPACING_MS;
  const none = (status: TeaserSendResult["status"]): TeaserSendResult => ({ status, eligible: 0, sent: 0, failed: 0 });

  const settings = await getWeeklyDigestSettings();
  if (!settings.weeklyDigestEmailLapsed) return none("disabled");

  const digest = await db.announcement.findUnique({
    where: { id: announcementId },
    select: { id: true, sentAt: true, retractedAt: true, digestPeriodEnd: true, digestHighlights: true },
  });
  if (!digest || !digest.sentAt || digest.retractedAt || !digest.digestPeriodEnd || !digest.digestHighlights) {
    return none("not-a-published-digest");
  }

  const claimed = await db.announcement.updateMany({
    where: { id: announcementId, digestEmailsSentAt: null },
    data: { digestEmailsSentAt: now },
  });
  if (claimed.count === 0) return none("already-sent");

  const cutoff = new Date(now.getTime() - settings.weeklyDigestLapsedDays * DAY_MS);
  const candidates = await db.user.findMany({
    where: {
      role: { in: [Role.member, Role.moderator, Role.admin] },
      tier: { not: null },
      digestEmailOptedOut: false,
      lastActiveAt: { not: null, lt: cutoff },
    },
    select: {
      id: true,
      email: true,
      name: true,
      lastActiveAt: true,
      digestEmailsSent: true,
      lastDigestEmailAt: true,
      digestUnsubscribeToken: true,
    },
  });

  const eligible = candidates.filter((user) => {
    const returned = user.lastDigestEmailAt !== null && user.lastActiveAt !== null && user.lastActiveAt > user.lastDigestEmailAt;
    const sentSoFar = returned ? 0 : user.digestEmailsSent;
    return sentSoFar < settings.weeklyDigestMaxEmailsPerMember;
  });

  const highlights = digest.digestHighlights as unknown as Highlights;
  const digestUrl = `${APP_URL()}/whats-new/announcements/${digest.id}`;
  let sent = 0;
  let failed = 0;

  for (const user of eligible) {
    try {
      const token = user.digestUnsubscribeToken ?? randomBytes(24).toString("hex");
      if (!user.digestUnsubscribeToken) {
        await db.user.update({ where: { id: user.id }, data: { digestUnsubscribeToken: token } });
      }

      const email = buildTeaserEmail(settings, highlights, user, {
        digestUrl,
        unsubscribeUrl: `${APP_URL()}/unsubscribe/digest/${token}`,
      });
      if (await send(user.email, email)) {
        const returned = user.lastDigestEmailAt !== null && user.lastActiveAt !== null && user.lastActiveAt > user.lastDigestEmailAt;
        await db.user.update({
          where: { id: user.id },
          data: { digestEmailsSent: (returned ? 0 : user.digestEmailsSent) + 1, lastDigestEmailAt: now },
        });
        sent += 1;
        if (spacingMs > 0) await new Promise((resolve) => setTimeout(resolve, spacingMs));
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`[weekly-digest-email] failed for user ${user.id}:`, error);
    }
  }

  return { status: "sent", eligible: eligible.length, sent, failed };
}

/**
 * Sends the teaser for any published weekly digest that hasn't had it yet.
 * Called from the worker's weekly-digest tick, so it covers both a digest
 * that auto-published and one an admin approved later from the Drafts list —
 * without making the approve request wait on hundreds of sends.
 */
export async function sendPendingDigestTeasers(now: Date = new Date()): Promise<TeaserSendResult[]> {
  const pending = await db.announcement.findMany({
    where: {
      digestPeriodEnd: { not: null },
      sentAt: { not: null, gt: new Date(now.getTime() - PENDING_TEASER_MAX_AGE_MS) },
      retractedAt: null,
      digestEmailsSentAt: null,
    },
    select: { id: true },
  });
  const results: TeaserSendResult[] = [];
  for (const { id } of pending) results.push(await sendDigestTeaserEmails(id, { now }));
  return results;
}

/** Unsubscribes the member who owns `token`; false when the token matches nobody. Idempotent. */
export async function unsubscribeFromDigestEmails(token: string): Promise<boolean> {
  if (!token || token.length < 16) return false;
  const result = await db.user.updateMany({ where: { digestUnsubscribeToken: token }, data: { digestEmailOptedOut: true } });
  return result.count > 0;
}
