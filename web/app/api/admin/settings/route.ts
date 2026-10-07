import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { AdmissionPhase, BodyFont, HeadingFont } from "@/lib/generated/prisma/enums";
import {
  getAdmissionPhase,
  setAdmissionPhase,
  getWelcomeAnnouncementSettings,
  setWelcomeAnnouncementSettings,
  getBroadcastEmailSettings,
  setBroadcastEmailSettings,
  getQuickRecordingMaxDuration,
  setQuickRecordingMaxDuration,
  getSiteFonts,
  setSiteFonts,
  getWeeklyDigestSettings,
  setWeeklyDigestSettings,
} from "@/lib/settings";
import {
  DIGEST_FREQUENCY_VALUES,
  WEEKLY_DIGEST_EMAIL_INTRO_MAX,
  WEEKLY_DIGEST_EMAIL_SUBJECT_MAX,
  WEEKLY_DIGEST_TIMEZONE_VALUES,
} from "@/lib/weekly-digest-config";

const patchSchema = z.object({
  admissionPhase: z.nativeEnum(AdmissionPhase).optional(),
  welcomeAnnouncementInFeed: z.boolean().optional(),
  welcomeAnnouncementNotify: z.boolean().optional(),
  welcomeAnnouncementEmail: z.boolean().optional(),
  announcementEmailEnabled: z.boolean().optional(),
  eventAnnouncementEmailEnabled: z.boolean().optional(),
  quickRecordingMaxDurationSeconds: z.number().int().min(1).max(3600).optional(),
  bodyFont: z.nativeEnum(BodyFont).optional(),
  headingFont: z.nativeEnum(HeadingFont).optional(),
  weeklyDigestEnabled: z.boolean().optional(),
  weeklyDigestFrequency: z.enum(DIGEST_FREQUENCY_VALUES).optional(),
  weeklyDigestDayOfWeek: z.number().int().min(0).max(6).optional(),
  weeklyDigestHour: z.number().int().min(0).max(23).optional(),
  weeklyDigestTimezone: z.enum(WEEKLY_DIGEST_TIMEZONE_VALUES).optional(),
  weeklyDigestAutoPublish: z.boolean().optional(),
  weeklyDigestPrivateCountMin: z.number().int().min(1).max(20).optional(),
  weeklyDigestIncludeNewMembers: z.boolean().optional(),
  weeklyDigestIncludeContent: z.boolean().optional(),
  weeklyDigestIncludeEvents: z.boolean().optional(),
  weeklyDigestIncludeForums: z.boolean().optional(),
  weeklyDigestIncludePeerReviews: z.boolean().optional(),
  weeklyDigestIncludeReplies: z.boolean().optional(),
  weeklyDigestIncludeKnowledgeHours: z.boolean().optional(),
  weeklyDigestEmailLapsed: z.boolean().optional(),
  weeklyDigestLapsedDays: z.number().int().min(1).max(365).optional(),
  weeklyDigestMaxEmailsPerMember: z.number().int().min(1).max(20).optional(),
  weeklyDigestEmailSubject: z.string().trim().min(1).max(WEEKLY_DIGEST_EMAIL_SUBJECT_MAX).optional(),
  weeklyDigestEmailIntro: z.string().trim().min(1).max(WEEKLY_DIGEST_EMAIL_INTRO_MAX).optional(),
});

const WEEKLY_DIGEST_KEYS = [
  "weeklyDigestEnabled",
  "weeklyDigestFrequency",
  "weeklyDigestDayOfWeek",
  "weeklyDigestHour",
  "weeklyDigestTimezone",
  "weeklyDigestAutoPublish",
  "weeklyDigestPrivateCountMin",
  "weeklyDigestIncludeNewMembers",
  "weeklyDigestIncludeContent",
  "weeklyDigestIncludeEvents",
  "weeklyDigestIncludeForums",
  "weeklyDigestIncludePeerReviews",
  "weeklyDigestIncludeReplies",
  "weeklyDigestIncludeKnowledgeHours",
  "weeklyDigestEmailLapsed",
  "weeklyDigestLapsedDays",
  "weeklyDigestMaxEmailsPerMember",
  "weeklyDigestEmailSubject",
  "weeklyDigestEmailIntro",
] as const;

export async function GET() {
  try {
    await requireRole([Role.admin]);
    return NextResponse.json({
      admissionPhase: await getAdmissionPhase(),
      ...(await getWelcomeAnnouncementSettings()),
      ...(await getBroadcastEmailSettings()),
      quickRecordingMaxDurationSeconds: await getQuickRecordingMaxDuration(),
      ...(await getSiteFonts()),
      ...(await getWeeklyDigestSettings()),
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.admissionPhase !== undefined) {
    await setAdmissionPhase(parsed.data.admissionPhase);
  }

  const { welcomeAnnouncementInFeed, welcomeAnnouncementNotify, welcomeAnnouncementEmail } = parsed.data;
  if (
    welcomeAnnouncementInFeed !== undefined ||
    welcomeAnnouncementNotify !== undefined ||
    welcomeAnnouncementEmail !== undefined
  ) {
    const current = await getWelcomeAnnouncementSettings();
    await setWelcomeAnnouncementSettings({
      welcomeAnnouncementInFeed: welcomeAnnouncementInFeed ?? current.welcomeAnnouncementInFeed,
      welcomeAnnouncementNotify: welcomeAnnouncementNotify ?? current.welcomeAnnouncementNotify,
      welcomeAnnouncementEmail: welcomeAnnouncementEmail ?? current.welcomeAnnouncementEmail,
    });
  }

  const { announcementEmailEnabled, eventAnnouncementEmailEnabled } = parsed.data;
  if (announcementEmailEnabled !== undefined || eventAnnouncementEmailEnabled !== undefined) {
    const current = await getBroadcastEmailSettings();
    await setBroadcastEmailSettings({
      announcementEmailEnabled: announcementEmailEnabled ?? current.announcementEmailEnabled,
      eventAnnouncementEmailEnabled: eventAnnouncementEmailEnabled ?? current.eventAnnouncementEmailEnabled,
    });
  }

  if (parsed.data.quickRecordingMaxDurationSeconds !== undefined) {
    await setQuickRecordingMaxDuration(parsed.data.quickRecordingMaxDurationSeconds);
  }

  const { bodyFont, headingFont } = parsed.data;
  if (bodyFont !== undefined || headingFont !== undefined) {
    const current = await getSiteFonts();
    await setSiteFonts({
      bodyFont: bodyFont ?? current.bodyFont,
      headingFont: headingFont ?? current.headingFont,
    });
  }

  const weeklyDigestPatch = Object.fromEntries(
    WEEKLY_DIGEST_KEYS.filter((key) => parsed.data[key] !== undefined).map((key) => [key, parsed.data[key]]),
  );
  if (Object.keys(weeklyDigestPatch).length > 0) {
    await setWeeklyDigestSettings(weeklyDigestPatch);
  }

  return NextResponse.json({
    admissionPhase: await getAdmissionPhase(),
    ...(await getWelcomeAnnouncementSettings()),
    ...(await getBroadcastEmailSettings()),
    quickRecordingMaxDurationSeconds: await getQuickRecordingMaxDuration(),
    ...(await getSiteFonts()),
    ...(await getWeeklyDigestSettings()),
  });
}
