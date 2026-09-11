import { db } from "@/lib/db";
import { AdmissionPhase, BodyFont, HeadingFont } from "@/lib/generated/prisma/enums";

export { ADMISSION_PHASE_LABELS } from "@/lib/admission-phase";

const SETTINGS_ROW_ID = 1;

/**
 * The SiteSettings row is created lazily on first read (self-healing, same
 * pattern as getSessionUser()'s Clerk fallback in lib/auth.ts) rather than
 * via a seed migration, so a fresh database always resolves to the PRD §3.2
 * default of Referral-Driven Growth without a separate seed step.
 */
export async function getAdmissionPhase(): Promise<AdmissionPhase> {
  const settings = await db.siteSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { id: SETTINGS_ROW_ID },
    update: {},
  });
  return settings.admissionPhase;
}

export async function setAdmissionPhase(phase: AdmissionPhase): Promise<void> {
  await db.siteSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { id: SETTINGS_ROW_ID, admissionPhase: phase },
    update: { admissionPhase: phase },
  });
}

export type WelcomeAnnouncementSettings = {
  welcomeAnnouncementInFeed: boolean;
  welcomeAnnouncementNotify: boolean;
  welcomeAnnouncementEmail: boolean;
};

export async function getWelcomeAnnouncementSettings(): Promise<WelcomeAnnouncementSettings> {
  const settings = await db.siteSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { id: SETTINGS_ROW_ID },
    update: {},
  });
  return {
    welcomeAnnouncementInFeed: settings.welcomeAnnouncementInFeed,
    welcomeAnnouncementNotify: settings.welcomeAnnouncementNotify,
    welcomeAnnouncementEmail: settings.welcomeAnnouncementEmail,
  };
}

export async function setWelcomeAnnouncementSettings(
  input: WelcomeAnnouncementSettings,
): Promise<void> {
  await db.siteSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { id: SETTINGS_ROW_ID, ...input },
    update: input,
  });
}

/** Quick Video Recording & Sharing initiative — see SiteSettings.quickRecordingMaxDurationSeconds's schema comment. */
export async function getQuickRecordingMaxDuration(): Promise<number> {
  const settings = await db.siteSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { id: SETTINGS_ROW_ID },
    update: {},
  });
  return settings.quickRecordingMaxDurationSeconds;
}

export async function setQuickRecordingMaxDuration(seconds: number): Promise<void> {
  await db.siteSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { id: SETTINGS_ROW_ID, quickRecordingMaxDurationSeconds: seconds },
    update: { quickRecordingMaxDurationSeconds: seconds },
  });
}

export type SiteFontSettings = {
  bodyFont: BodyFont;
  headingFont: HeadingFont;
};

// Prisma schema defaults (prisma/schema.prisma's SiteSettings.bodyFont /
// .headingFont @default) — used as a build-time fallback below, so a fresh
// row would resolve to the exact same values anyway.
const DEFAULT_SITE_FONTS: SiteFontSettings = { bodyFont: BodyFont.montserrat, headingFont: HeadingFont.mulish };

export async function getSiteFonts(): Promise<SiteFontSettings> {
  // Called from the root layout, so it runs for every page — including
  // the app/(marketing) pages that are statically generated (objective
  // 4). Docker's `next build` step has no network path to the database
  // (standard build-stage isolation; the app only reaches `postgres` at
  // container runtime, via the compose network), so static generation for
  // those pages needs this to degrade to a sane default rather than fail
  // the whole build. Production always has a reachable DB at request
  // time — this only ever triggers during the image build, for a
  // low-stakes cosmetic setting, not requests, so silently degrading here
  // is deliberate rather than an error worth surfacing.
  try {
    const settings = await db.siteSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      create: { id: SETTINGS_ROW_ID },
      update: {},
    });
    return { bodyFont: settings.bodyFont, headingFont: settings.headingFont };
  } catch {
    return DEFAULT_SITE_FONTS;
  }
}

export async function setSiteFonts(input: SiteFontSettings): Promise<void> {
  await db.siteSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: { id: SETTINGS_ROW_ID, ...input },
    update: input,
  });
}
