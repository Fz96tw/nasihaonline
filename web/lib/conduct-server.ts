import "server-only";
import { db } from "@/lib/db";
import { ConductActionTaken } from "@/lib/generated/prisma/enums";
import type { CodeOfConductViolationModel } from "@/lib/generated/prisma/models/CodeOfConductViolation";

export class ConductError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Creates an open (unactioned) CodeOfConductViolation from a Directory
 * card's "Report" action (§4.15). Distinct from content-flagging — this is
 * a concern about the member themselves, not a specific piece of content.
 */
export async function createConductReport(
  reporterId: string,
  input: { reportedUserId: string; description: string },
): Promise<CodeOfConductViolationModel> {
  if (input.reportedUserId === reporterId) {
    throw new ConductError(400, "You can't report yourself.");
  }

  const reportedUser = await db.user.findUnique({ where: { id: input.reportedUserId } });
  if (!reportedUser) throw new ConductError(404, "Member not found.");

  return db.codeOfConductViolation.create({
    data: {
      reportedUserId: input.reportedUserId,
      reporterId,
      description: input.description,
    },
  });
}

export type OpenConductReport = CodeOfConductViolationModel & {
  reportedUser: { id: string; name: string | null; email: string };
  reporter: { id: string; name: string | null; email: string } | null;
  priorViolations: CodeOfConductViolationModel[];
};

/** GET /admin/conduct's queue — open reports plus each reported member's already-actioned history, so a second violation can be identified. */
export async function getOpenConductReports(): Promise<OpenConductReport[]> {
  const reports = await db.codeOfConductViolation.findMany({
    where: { actionTaken: null },
    orderBy: { createdAt: "desc" },
    include: {
      reportedUser: { select: { id: true, name: true, email: true } },
      reporter: { select: { id: true, name: true, email: true } },
    },
  });

  if (reports.length === 0) return [];

  const reportedUserIds = Array.from(new Set(reports.map((report) => report.reportedUserId)));
  const priorViolations = await db.codeOfConductViolation.findMany({
    where: { reportedUserId: { in: reportedUserIds }, actionTaken: { not: null } },
    orderBy: { actionTakenAt: "desc" },
  });

  return reports.map((report) => ({
    ...report,
    priorViolations: priorViolations.filter((violation) => violation.reportedUserId === report.reportedUserId),
  }));
}

/** Cheap count for the `/admin` dashboard badge. */
export async function getOpenConductReportCount(): Promise<number> {
  return db.codeOfConductViolation.count({ where: { actionTaken: null } });
}

/**
 * Records an admin's handling of an open report (§4.15). suspension/removal
 * also flips User.suspended — the same effect as 6.2's suspend action in
 * app/api/admin/users/[id]/route.ts (removal has no separate hard-delete
 * path in this data model's immutable-ledger design, so it's a permanent
 * suspension).
 */
export async function recordConductAction(
  id: string,
  adminId: string,
  action: ConductActionTaken,
): Promise<CodeOfConductViolationModel> {
  const report = await db.codeOfConductViolation.findUnique({ where: { id } });
  if (!report) throw new ConductError(404, "Report not found.");
  if (report.actionTaken !== null) throw new ConductError(409, "This report has already been handled.");

  if (report.reportedUserId === adminId && action !== ConductActionTaken.warning) {
    // Mirrors the self-suspend guard on /admin/users — an admin locking
    // themselves out of /admin has no recovery path short of a DB edit.
    throw new ConductError(400, "You cannot suspend or remove your own account.");
  }

  const [updated] = await db.$transaction([
    db.codeOfConductViolation.update({
      where: { id },
      data: { actionTaken: action, handledByUserId: adminId, actionTakenAt: new Date() },
    }),
    ...(action === ConductActionTaken.suspension || action === ConductActionTaken.removal
      ? [
          db.user.update({
            where: { id: report.reportedUserId },
            data: { suspended: true, suspendedAt: new Date() },
          }),
        ]
      : []),
  ]);

  return updated;
}

/** The signed-in member's own Settings view — actioned violations only; open reports about them aren't shown until an admin has adjudicated. */
export async function getConductNoticesForUser(userId: string): Promise<CodeOfConductViolationModel[]> {
  return db.codeOfConductViolation.findMany({
    where: { reportedUserId: userId, actionTaken: { not: null } },
    orderBy: { actionTakenAt: "desc" },
  });
}

/** The Dashboard's account-notices widget — only notices the member hasn't dismissed yet. */
export async function getUnacknowledgedConductNoticesForUser(
  userId: string,
): Promise<CodeOfConductViolationModel[]> {
  return db.codeOfConductViolation.findMany({
    where: { reportedUserId: userId, actionTaken: { not: null }, acknowledgedAt: null },
    orderBy: { actionTakenAt: "desc" },
  });
}

/**
 * Self-service dismissal (Settings/Dashboard) — distinct from admin
 * fulfillment. Acknowledging only clears the "needs attention" badge/widget
 * entry; the notice itself stays in the member's Settings history, same as
 * before.
 */
export async function acknowledgeConductNotice(
  id: string,
  userId: string,
): Promise<CodeOfConductViolationModel> {
  const notice = await db.codeOfConductViolation.findUnique({ where: { id } });
  if (!notice) throw new ConductError(404, "Notice not found.");
  if (notice.reportedUserId !== userId) throw new ConductError(403, "This notice isn't yours to acknowledge.");
  if (notice.acknowledgedAt) throw new ConductError(409, "This notice has already been acknowledged.");

  return db.codeOfConductViolation.update({
    where: { id },
    data: { acknowledgedAt: new Date() },
  });
}
