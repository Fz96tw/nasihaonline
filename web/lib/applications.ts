import { db } from "@/lib/db";
import { ApplicationStatus } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";

const KNOWN_STATUSES = new Set<string>(Object.values(ApplicationStatus));

// Statuses that count as an "active" application for duplicate-email
// purposes — a rejected application must not block reapplication.
export const BLOCKING_APPLICATION_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.submitted,
  ApplicationStatus.under_review,
  ApplicationStatus.approved,
];

export type DuplicateApplicantReason = "existing_member" | "pending_application";

/**
 * Checks whether an email already belongs to a member account or has an
 * active (non-rejected) application, so callers can reject duplicate
 * /join submissions before creating a new MembershipApplication row.
 * Mirrors the skip condition already used by autoSubmitFriendApplication.
 */
export async function findDuplicateApplicant(
  email: string,
): Promise<DuplicateApplicantReason | null> {
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) return "existing_member";

  const existingApplication = await db.membershipApplication.findFirst({
    where: { email, status: { in: BLOCKING_APPLICATION_STATUSES } },
  });
  if (existingApplication) return "pending_application";

  return null;
}

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
  referredBy: string | null,
): Prisma.MembershipApplicationWhereInput {
  const where: Prisma.MembershipApplicationWhereInput = {};
  if (status && KNOWN_STATUSES.has(status)) {
    where.status = status as ApplicationStatus;
  }
  if (referredBy) {
    // Free-text "how heard" member name, or the structured event-guest
    // referral (MembershipApplication.referredBy) — either counts.
    where.OR = [
      { howHeardMemberName: { contains: referredBy, mode: "insensitive" } },
      { referredBy: { name: { contains: referredBy, mode: "insensitive" } } },
    ];
  }
  return where;
}

/** "Referred by {member} (event: {title})" — an application that came in through an event guest's apply-to-join link. */
export function formatGuestReferral(memberName: string | null | undefined, eventTitle: string | null | undefined): string {
  const by = `Referred by ${memberName ?? "a member"}`;
  return eventTitle ? `${by} (event: ${eventTitle})` : by;
}
