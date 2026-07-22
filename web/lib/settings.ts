import { db } from "@/lib/db";
import { AdmissionPhase } from "@/lib/generated/prisma/enums";

export { ADMISSION_PHASE_LABELS, professionalReferenceRequired } from "@/lib/admission-phase";

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
