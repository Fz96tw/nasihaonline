import "server-only";
import { db } from "@/lib/db";
import { PrivacyRequestStatus, type PrivacyRequestType } from "@/lib/generated/prisma/enums";
import type { PrivacyDataRequestModel } from "@/lib/generated/prisma/models/PrivacyDataRequest";

export class PrivacyError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Member-facing request creation from the Settings Privacy section (§4.15).
 * Guards against filing a duplicate request of the same type while one is
 * still pending — the admin queue would otherwise pile up near-identical
 * rows for the same member.
 */
export async function createPrivacyDataRequest(
  userId: string,
  type: PrivacyRequestType,
): Promise<PrivacyDataRequestModel> {
  const existing = await db.privacyDataRequest.findFirst({
    where: { userId, type, status: PrivacyRequestStatus.pending },
  });
  if (existing) {
    throw new PrivacyError(409, "You already have a pending request of this type.");
  }

  return db.privacyDataRequest.create({ data: { userId, type } });
}

/** The signed-in member's own Settings view — full request history (pending, fulfilled, rejected). */
export async function getPrivacyRequestsForUser(userId: string): Promise<PrivacyDataRequestModel[]> {
  return db.privacyDataRequest.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
  });
}

/** The Dashboard's account-notices widget — only the still-open requests, so a fulfilled request doesn't linger as a "notice". */
export async function getPendingPrivacyRequestsForUser(userId: string): Promise<PrivacyDataRequestModel[]> {
  return db.privacyDataRequest.findMany({
    where: { userId, status: PrivacyRequestStatus.pending },
    orderBy: { requestedAt: "desc" },
  });
}

export type OpenPrivacyRequest = PrivacyDataRequestModel & {
  user: { id: string; name: string | null; email: string };
  hasRetainedHistory: boolean;
};

/**
 * GET /admin/privacy-requests's queue — open (pending) requests, each
 * flagged with whether the member has ContributionLedger entries or
 * authored content (Blog/Library/Forum). §4.4's immutable ledger means
 * those rows are retained even when a deletion request is fulfilled — the
 * admin queue surfaces that up front rather than leaving it to be
 * discovered mid-fulfillment.
 */
export async function getOpenPrivacyRequests(): Promise<OpenPrivacyRequest[]> {
  const requests = await db.privacyDataRequest.findMany({
    where: { status: PrivacyRequestStatus.pending },
    orderBy: { requestedAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (requests.length === 0) return [];

  const userIds = Array.from(new Set(requests.map((request) => request.userId)));
  const [ledgerRows, postRows, knowledgeRows, forumPostRows] = await Promise.all([
    db.contributionLedger.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.post.findMany({
      where: { authorId: { in: userIds } },
      select: { authorId: true },
      distinct: ["authorId"],
    }),
    db.knowledgeItem.findMany({
      where: { contributorId: { in: userIds } },
      select: { contributorId: true },
      distinct: ["contributorId"],
    }),
    db.forumPost.findMany({
      where: { authorId: { in: userIds } },
      select: { authorId: true },
      distinct: ["authorId"],
    }),
  ]);

  const historyUserIds = new Set<string>([
    ...ledgerRows.map((row) => row.userId),
    ...postRows.map((row) => row.authorId),
    ...knowledgeRows.map((row) => row.contributorId),
    ...forumPostRows.map((row) => row.authorId),
  ]);

  return requests.map((request) => ({
    ...request,
    hasRetainedHistory: historyUserIds.has(request.userId),
  }));
}

/** Cheap count for the `/admin` dashboard badge. */
export async function getOpenPrivacyRequestCount(): Promise<number> {
  return db.privacyDataRequest.count({ where: { status: PrivacyRequestStatus.pending } });
}

/**
 * Records an admin's fulfillment of an open request (§4.15). Actual
 * export-file generation or deletion/anonymization happens manually,
 * offline — this only records that the work was done. ContributionLedger
 * and content rows are never touched here (§4.4).
 */
export async function fulfillPrivacyDataRequest(
  id: string,
  adminId: string,
): Promise<PrivacyDataRequestModel> {
  const request = await db.privacyDataRequest.findUnique({ where: { id } });
  if (!request) throw new PrivacyError(404, "Request not found.");
  if (request.status !== PrivacyRequestStatus.pending) {
    throw new PrivacyError(409, "This request has already been handled.");
  }

  return db.privacyDataRequest.update({
    where: { id },
    data: { status: PrivacyRequestStatus.fulfilled, handledByUserId: adminId, fulfilledAt: new Date() },
  });
}
