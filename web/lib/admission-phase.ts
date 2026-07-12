import { AdmissionPhase } from "@/lib/generated/prisma/enums";

/**
 * Client-safe (no Prisma/db import) admission-phase helpers. lib/settings.ts
 * does the actual DB read/write; this file exists separately so client
 * components (e.g. the /join form) can import labels and the
 * professionalReferenceRequired() rule without pulling the Prisma client
 * into the browser bundle.
 */
export const ADMISSION_PHASE_LABELS: Record<AdmissionPhase, string> = {
  [AdmissionPhase.founding_cohort]: "Founding Cohort — Invite Only",
  [AdmissionPhase.referral_driven_growth]: "Referral-Driven Growth",
  [AdmissionPhase.open_applications]: "Open Applications",
};

export function professionalReferenceRequired(phase: AdmissionPhase): boolean {
  return phase === AdmissionPhase.open_applications;
}
