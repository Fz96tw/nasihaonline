import { ApplicationStatus } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";

const KNOWN_STATUSES = new Set<string>(Object.values(ApplicationStatus));

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.submitted]: "Submitted",
  [ApplicationStatus.under_review]: "Under Review",
  [ApplicationStatus.approved]: "Approved",
  [ApplicationStatus.rejected]: "Rejected",
};

export const STATUS_BADGE_VARIANT: Record<
  ApplicationStatus,
  "neutral" | "success" | "warning" | "danger" | "info"
> = {
  [ApplicationStatus.submitted]: "info",
  [ApplicationStatus.under_review]: "warning",
  [ApplicationStatus.approved]: "success",
  [ApplicationStatus.rejected]: "danger",
};

/**
 * Shared between GET /api/admin/applications and the /admin/applications
 * page's own server-side query, so the two filtering paths can't drift.
 */
export function buildApplicationFilterWhere(
  status: string | null,
  referral: string | null,
): Prisma.MembershipApplicationWhereInput {
  const where: Prisma.MembershipApplicationWhereInput = {};
  if (status && KNOWN_STATUSES.has(status)) {
    where.status = status as ApplicationStatus;
  }
  if (referral) {
    where.referral = { contains: referral, mode: "insensitive" };
  }
  return where;
}
