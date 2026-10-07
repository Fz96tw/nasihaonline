// No "server-only" guard: imported by scripts/worker.ts (the weekly-digest
// check), which runs outside Next's server runtime — same convention as
// lib/inbox-reminders.ts.
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import { getWeeklyDigestSettings } from "@/lib/settings";
import { createAnnouncementDraft, publishAnnouncementDraft } from "@/lib/announcements-server";
import { generateWeeklyDigest } from "@/lib/weekly-digest-server";
import type { WeeklyDigest } from "@/lib/weekly-digest-compose";
import { buildTeaserEmail } from "@/lib/weekly-digest-email";
import { enqueueAnnouncementIndexSync } from "@/lib/queues/search-index-queue";

const SETTINGS_ROW_ID = 1;
const WEEK_DAYS = 7;
/**
 * How long after its scheduled time a missed digest is still produced — covers
 * a worker that was down or restarting at the exact fire time. Past this it's
 * skipped rather than posting a "this week" digest days late.
 */
const CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The most recent moment at or before `now` that falls on `dayOfWeek` (0 =
 * Sunday) at `hour`:00 wall-clock time in `timeZone` — as a UTC instant, so
 * daylight-saving shifts are handled by the zone rather than by adding 7×24h.
 */
export function latestScheduledFire(now: Date, dayOfWeek: number, hour: number, timeZone: string): Date {
  const local = toZonedTime(now, timeZone);
  const candidate = new Date(local);
  candidate.setHours(hour, 0, 0, 0);
  candidate.setDate(candidate.getDate() - ((local.getDay() - dayOfWeek + WEEK_DAYS) % WEEK_DAYS));
  if (candidate.getTime() > local.getTime()) candidate.setDate(candidate.getDate() - WEEK_DAYS);
  return fromZonedTime(candidate, timeZone);
}

export type WeeklyDigestCheckResult =
  | { status: "disabled" }
  | { status: "not-due"; fireAt: string }
  | { status: "already-handled"; fireAt: string }
  | { status: "quiet"; fireAt: string }
  | { status: "created"; fireAt: string; announcementId: string; published: boolean };

/**
 * One tick of the weekly-digest check, run every few minutes by the worker.
 * Settings are read fresh each tick, so a change to the day/hour/time zone or
 * the on/off switch applies at the next tick with no redeploy.
 *
 * Idempotency is two layers: `SiteSettings.weeklyDigestLastFiredFor` is
 * atomically claimed (compare-and-set) before any work, so a restart or two
 * overlapping ticks can't both generate; and `Announcement.digestPeriodEnd`
 * is unique per week, so the database refuses a duplicate regardless. A quiet
 * week still consumes the claim (nothing is retried until next week), but a
 * crash while generating releases it so the next tick retries within the
 * catch-up window.
 */
export async function runWeeklyDigestCheck(now: Date = new Date()): Promise<WeeklyDigestCheckResult> {
  const settings = await getWeeklyDigestSettings();
  if (!settings.weeklyDigestEnabled) return { status: "disabled" };

  const fireAt = latestScheduledFire(now, settings.weeklyDigestDayOfWeek, settings.weeklyDigestHour, settings.weeklyDigestTimezone);
  const fireIso = fireAt.toISOString();
  if (now.getTime() - fireAt.getTime() > CATCH_UP_WINDOW_MS) return { status: "not-due", fireAt: fireIso };

  const row = await db.siteSettings.findUnique({
    where: { id: SETTINGS_ROW_ID },
    select: { weeklyDigestLastFiredFor: true },
  });
  const previous = row?.weeklyDigestLastFiredFor ?? null;
  if (previous && previous.getTime() >= fireAt.getTime()) return { status: "already-handled", fireAt: fireIso };

  const claimed = await db.siteSettings.updateMany({
    where: {
      id: SETTINGS_ROW_ID,
      OR: [{ weeklyDigestLastFiredFor: null }, { weeklyDigestLastFiredFor: { lt: fireAt } }],
    },
    data: { weeklyDigestLastFiredFor: fireAt },
  });
  if (claimed.count === 0) return { status: "already-handled", fireAt: fireIso };

  try {
    const digest = await generateWeeklyDigest(fireAt, settings);
    if (!digest) return { status: "quiet", fireAt: fireIso };

    const { id } = await saveWeeklyDigest(digest, fireAt, settings.weeklyDigestAutoPublish);
    return { status: "created", fireAt: fireIso, announcementId: id, published: settings.weeklyDigestAutoPublish };
  } catch (error) {
    // A unique-constraint hit on digestPeriodEnd means another run already
    // made this week's digest — keep the claim, nothing to retry.
    if ((error as { code?: string }).code === "P2002") return { status: "already-handled", fireAt: fireIso };
    // Anything else: release the claim so the next tick retries.
    await db.siteSettings.updateMany({
      where: { id: SETTINGS_ROW_ID, weeklyDigestLastFiredFor: fireAt },
      data: { weeklyDigestLastFiredFor: previous },
    });
    throw error;
  }
}

/**
 * Stores a generated digest as an Announcement keyed to its week
 * (`digestPeriodEnd`), authored by the oldest admin like the welcome
 * announcement, then publishes it when `publish` is set. Shared by the
 * scheduled check and the admin "Generate now" action. Feed only: the
 * digest's own bell/email legs are deliberately off — the inactive-member
 * teaser email is a separate, targeted send. Throws a Prisma P2002 if this
 * week already has a digest.
 */
async function saveWeeklyDigest(
  digest: WeeklyDigest,
  weekKey: Date,
  publish: boolean,
): Promise<{ id: string }> {
  const author = await db.user.findFirst({
    where: { role: Role.admin },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!author) throw new Error("no admin user to author the weekly digest");

  const { id } = await createAnnouncementDraft(author.id, {
    title: digest.title,
    body: digest.body,
    showInFeed: true,
    notifyInApp: false,
    sendEmail: false,
    digestPeriodEnd: weekKey,
    digestHighlights: digest.highlights,
    digestContent: digest.content,
  });

  if (publish) {
    await publishAnnouncementDraft(id);
    await enqueueAnnouncementIndexSync(id);
  }
  return { id };
}

export type WeeklyDigestPreview =
  | { quiet: true }
  | {
      quiet: false;
      title: string;
      body: string;
      email: { subject: string; introParagraphs: string[]; highlightLines: string[]; titlesLine: string | null };
    };

/**
 * What the digest — and the inactive-member email — would look like right now
 * under the saved settings. Read-only: nothing is created and nothing is
 * claimed. `viewerName` personalises the sample email's {firstName}.
 */
export async function previewWeeklyDigest(
  viewerName: string | null,
  now: Date = new Date(),
): Promise<WeeklyDigestPreview> {
  const settings = await getWeeklyDigestSettings();
  const digest = await generateWeeklyDigest(now, settings);
  if (!digest) return { quiet: true };

  const email = buildTeaserEmail(settings, digest.highlights, { name: viewerName }, {
    digestUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/whats-new/announcements/…`,
    unsubscribeUrl: "(a personal unsubscribe link)",
  });
  return {
    quiet: false,
    title: digest.title,
    body: digest.body,
    email: {
      subject: email.subject,
      introParagraphs: email.introParagraphs,
      highlightLines: email.highlightLines,
      titlesLine: email.titlesLine,
    },
  };
}

export type GenerateNowResult =
  | { status: "quiet" }
  | { status: "duplicate"; announcementId: string }
  | { status: "created"; announcementId: string; published: boolean };

/**
 * Admin "Generate now": builds the digest from the last seven days up to this
 * moment, as a draft or published per the auto-publish setting, even while the
 * schedule is switched off. It takes the current scheduled week's key
 * (`digestPeriodEnd` = that week's fire time), so it can't duplicate the
 * scheduled run — and the scheduled run then finds the week already handled.
 * A quiet week creates nothing and leaves the week open.
 */
export async function generateWeeklyDigestNow(now: Date = new Date()): Promise<GenerateNowResult> {
  const settings = await getWeeklyDigestSettings();
  const weekKey = latestScheduledFire(now, settings.weeklyDigestDayOfWeek, settings.weeklyDigestHour, settings.weeklyDigestTimezone);

  const existing = await db.announcement.findUnique({ where: { digestPeriodEnd: weekKey }, select: { id: true } });
  if (existing) return { status: "duplicate", announcementId: existing.id };

  const digest = await generateWeeklyDigest(now, settings);
  if (!digest) return { status: "quiet" };

  try {
    const { id } = await saveWeeklyDigest(digest, weekKey, settings.weeklyDigestAutoPublish);
    // The scheduled tick shouldn't regenerate this week either.
    await db.siteSettings.updateMany({
      where: { id: SETTINGS_ROW_ID, OR: [{ weeklyDigestLastFiredFor: null }, { weeklyDigestLastFiredFor: { lt: weekKey } }] },
      data: { weeklyDigestLastFiredFor: weekKey },
    });
    return { status: "created", announcementId: id, published: settings.weeklyDigestAutoPublish };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const winner = await db.announcement.findUnique({ where: { digestPeriodEnd: weekKey }, select: { id: true } });
      return { status: "duplicate", announcementId: winner?.id ?? "" };
    }
    throw error;
  }
}
