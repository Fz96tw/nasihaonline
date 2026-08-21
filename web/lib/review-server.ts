import "server-only";
import { db } from "@/lib/db";
import {
  uploadKnowledgeDocument,
  deleteKnowledgeDocument,
  getReviewDocumentUrl,
  uploadKnowledgeItemHeroImage,
  getKnowledgeItemHeroImageUrl,
  deleteKnowledgeItemHeroImage,
  getProfileAvatarUrl,
  UploadValidationError,
} from "@/lib/storage";
import {
  NotificationType,
  ContributionSource,
  KnowledgeContentType,
  KnowledgeLevel,
  KnowledgeStatus,
  KnowledgeVisibility,
  LedgerStatus,
  LedgerTransactionType,
  ReviewItemStatus,
  ReviewVolunteerStatus,
  Role,
} from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import { DIRECTORY_TIERS } from "@/lib/members";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { createNotification } from "@/lib/notifications-server";
import { sendReviewInviteEmail, sendReviewLifecycleEmail } from "@/lib/email";
import type {
  MyReviewSubmission,
  ReviewCategoryOption,
  ReviewCommentNode,
  PendingVolunteerOffer,
  ReviewItemDetail,
  ReviewItemForEdit,
  ReviewItemRosterMember,
  ReviewTagOption,
  SeekingReviewersItem,
  SharedReviewItem,
} from "@/lib/review";

// Absolute, not relative — same rationale as library-server.ts's APP_URL.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export class ReviewItemError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export async function getReviewCategories(): Promise<ReviewCategoryOption[]> {
  return db.knowledgeCategory.findMany({ orderBy: { name: "asc" } });
}

export async function getReviewTags(): Promise<ReviewTagOption[]> {
  return db.knowledgeTag.findMany({ orderBy: { name: "asc" } });
}

/**
 * Submitter, an invitee, or a moderator/admin — full access to the material
 * and the comment thread. A ReviewItem has no "public" visibility tier the
 * way KnowledgeItem does (canViewKnowledgeItem, lib/library-server.ts),
 * since Peer Review & Feedback is invite-only by design, not optionally
 * restricted. Every member-facing action (comment, flag, edit) below
 * applies this gate itself rather than trusting the caller already checked
 * it, same "every action route re-checks independently" convention as the
 * Library.
 */
export function canViewReviewItem(
  item: { submitterId: string; invitees: { userId: string }[] },
  actingUser: UserModel,
): boolean {
  const isPrivileged = actingUser.role === Role.admin || actingUser.role === Role.moderator;
  return (
    item.submitterId === actingUser.id ||
    item.invitees.some((invitee) => invitee.userId === actingUser.id) ||
    isPrivileged
  );
}

/**
 * Everyone canViewReviewItem already covers, plus any member for an open
 * call (seekingReviewers + status: open) — the tier the "What's New" feed
 * and the "Members Seeking Reviewers" tab already link to publicly.
 * getReviewItemDetail uses this as its existence gate, then hands back a
 * reduced object (no attachment/externalUrl/youtubeUrl, no comment thread)
 * for a caller who only clears this and not canViewReviewItem — so the
 * detail page renders an "Offer to Review" preview instead of notFound().
 */
function canPreviewReviewItem(
  item: { submitterId: string; invitees: { userId: string }[]; seekingReviewers: boolean; status: ReviewItemStatus },
  actingUser: UserModel,
): boolean {
  return (
    canViewReviewItem(item, actingUser) ||
    (item.seekingReviewers && item.status === ReviewItemStatus.open)
  );
}

/**
 * "Submit an Item" (create) — always creates an `open` item. Mirrors
 * createKnowledgeItem's shape and validation (content-type/source
 * exclusivity, de-identification gate), minus the one-time licenseConsented
 * field (nothing here is published openly by default) and minus the
 * public/restricted visibility split (always invite-only). Fires
 * peer_review_invited to every invitee immediately — unlike the Library's
 * createKnowledgeItem, a ReviewItem has no pending_review gate hiding it
 * from invitees first, so there's no "defer notification until visible"
 * concern here.
 */
export async function createReviewItem(
  submitterId: string,
  input: {
    title: string;
    description: string;
    contentType: KnowledgeContentType;
    level: KnowledgeLevel;
    categoryIds: string[];
    tagIds: string[];
    youtubeUrl: string | null;
    externalUrl: string | null;
    deidentificationConfirmed: boolean;
    invitedUserIds: string[];
    seekingReviewers: boolean;
    volunteerNote: string | null;
    file: File | null;
    heroImage: File | null;
  },
): Promise<{ id: string }> {
  if (input.contentType === KnowledgeContentType.case_study && !input.deidentificationConfirmed) {
    throw new ReviewItemError(400, "You must confirm all patient information has been de-identified.");
  }
  if (!input.seekingReviewers && input.invitedUserIds.length === 0) {
    throw new ReviewItemError(400, "Select at least one reviewer to invite.");
  }

  const invitedUsers =
    input.invitedUserIds.length > 0
      ? await db.user.findMany({
          where: {
            id: { in: input.invitedUserIds, notIn: [submitterId] },
            tier: { in: DIRECTORY_TIERS },
            profile: { listInDirectory: true },
          },
          select: { id: true, email: true, name: true },
        })
      : [];

  const categories = await db.knowledgeCategory.findMany({
    where: { id: { in: input.categoryIds } },
    select: { id: true },
  });
  if (categories.length !== input.categoryIds.length) {
    throw new ReviewItemError(400, "Select at least one valid category.");
  }

  const isRecordedLecture = input.contentType === KnowledgeContentType.recorded_lecture;
  if (isRecordedLecture && !input.youtubeUrl) {
    throw new ReviewItemError(400, "A YouTube URL is required for a recorded lecture.");
  }
  if (!isRecordedLecture && input.file && input.externalUrl) {
    throw new ReviewItemError(400, "Choose either a file upload or an external link, not both.");
  }
  if (!isRecordedLecture && !input.file && !input.externalUrl) {
    throw new ReviewItemError(400, "A file upload or external link is required for this content type.");
  }

  let attachment: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number } | null = null;
  if (!isRecordedLecture && input.file) {
    try {
      attachment = await uploadKnowledgeDocument(input.file);
    } catch (error) {
      if (error instanceof UploadValidationError) throw new ReviewItemError(400, error.message);
      throw error;
    }
  }

  let heroImageUrl: string | null = null;
  if (input.heroImage) {
    try {
      heroImageUrl = await uploadKnowledgeItemHeroImage(input.heroImage);
    } catch (error) {
      if (error instanceof UploadValidationError) throw new ReviewItemError(400, error.message);
      throw error;
    }
  }

  const submitter = await db.user.findUnique({ where: { id: submitterId }, select: { name: true } });
  const submitterName = submitter?.name ?? "A member";

  const item = await db.reviewItem.create({
    data: {
      title: input.title,
      description: input.description,
      contentType: input.contentType,
      level: input.level,
      submitterId,
      youtubeUrl: isRecordedLecture ? input.youtubeUrl : null,
      heroImageUrl,
      externalUrl: isRecordedLecture ? null : input.externalUrl,
      deidentificationConfirmed: input.deidentificationConfirmed,
      status: ReviewItemStatus.open,
      seekingReviewers: input.seekingReviewers,
      volunteerNote: input.volunteerNote,
      categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      attachments: attachment ? { create: [attachment] } : undefined,
      invitees: invitedUsers.length > 0 ? { create: invitedUsers.map((user) => ({ userId: user.id })) } : undefined,
    },
    select: { id: true },
  });

  await notifyInvitedReviewUsers(db, {
    reviewItemId: item.id,
    title: input.title,
    submitterName,
    userIds: invitedUsers.map((user) => user.id),
  });
  await emailInvitedReviewUsers(invitedUsers, { reviewItemId: item.id, title: input.title, submitterName });

  return item;
}

/**
 * Bell-notifies invitees that they've been invited to review an item —
 * mirrors notifyInvitedLibraryUsers, reused by createReviewItem,
 * updateReviewItemInvitees, and (Objective 3) an accepted volunteer offer.
 * Takes a transaction client so callers can post it alongside other writes.
 */
async function notifyInvitedReviewUsers(
  tx: Prisma.TransactionClient | typeof db,
  params: { reviewItemId: string; title: string; submitterName: string; userIds: string[] },
): Promise<void> {
  if (params.userIds.length === 0) return;
  const link = `/review-feedback/${params.reviewItemId}`;
  const message = `${params.submitterName} invited you to review "${params.title}".`;
  await tx.notification.createMany({
    data: params.userIds.map((userId) => ({
      recipientId: userId,
      type: NotificationType.peer_review_invited,
      message,
      link,
    })),
  });
}

/** Emails invitees the same "invited to review" copy, best-effort — mirrors emailInvitedLibraryUsers. */
async function emailInvitedReviewUsers(
  users: { email: string; name: string | null }[],
  params: { reviewItemId: string; title: string; submitterName: string },
): Promise<void> {
  if (users.length === 0) return;
  const link = `${APP_URL}/review-feedback/${params.reviewItemId}`;
  await Promise.allSettled(
    users.map((user) =>
      sendReviewInviteEmail(user.email, user.name ?? "there", {
        submitterName: params.submitterName,
        title: params.title,
        link,
      }),
    ),
  );
}

function assertSubmitter(item: { submitterId: string }, actingUser: UserModel): void {
  const isPrivileged = actingUser.role === Role.admin || actingUser.role === Role.moderator;
  if (item.submitterId !== actingUser.id && !isPrivileged) {
    throw new ReviewItemError(403, "Only the submitter can manage this item.");
  }
}

/** Submitter-only — closes an open item, no longer counting it toward reviewers' "needs feedback" queue. */
export async function closeReviewItem(itemId: string, actingUser: UserModel): Promise<{ id: string; status: ReviewItemStatus }> {
  const item = await db.reviewItem.findUnique({ where: { id: itemId }, select: { submitterId: true, status: true } });
  if (!item) throw new ReviewItemError(404, "Review item not found.");
  assertSubmitter(item, actingUser);
  if (item.status === ReviewItemStatus.closed) return { id: itemId, status: ReviewItemStatus.closed };

  const updated = await db.reviewItem.update({
    where: { id: itemId },
    data: { status: ReviewItemStatus.closed },
    select: { id: true, status: true },
  });
  return updated;
}

/** Submitter-only — reopens a closed item (e.g. to keep collecting feedback). */
export async function reopenReviewItem(itemId: string, actingUser: UserModel): Promise<{ id: string; status: ReviewItemStatus }> {
  const item = await db.reviewItem.findUnique({ where: { id: itemId }, select: { submitterId: true, status: true } });
  if (!item) throw new ReviewItemError(404, "Review item not found.");
  assertSubmitter(item, actingUser);
  if (item.status === ReviewItemStatus.open) return { id: itemId, status: ReviewItemStatus.open };

  const updated = await db.reviewItem.update({
    where: { id: itemId },
    data: { status: ReviewItemStatus.open },
    select: { id: true, status: true },
  });
  return updated;
}

/**
 * Submitter-only — full edit of a submission's field set (not invitees, see
 * updateReviewItemInvitees). Mirrors updateKnowledgeItem's attachment
 * handling exactly: a new file uploads and is attached before the old one is
 * dropped, so a failed upload never destroys the working attachment, and the
 * old MinIO object is only deleted once the DB transaction that stops
 * referencing it has committed.
 */
export async function updateReviewItem(
  itemId: string,
  actingUser: UserModel,
  input: {
    title: string;
    description: string;
    contentType: KnowledgeContentType;
    level: KnowledgeLevel;
    categoryIds: string[];
    tagIds: string[];
    youtubeUrl: string | null;
    externalUrl: string | null;
    deidentificationConfirmed: boolean;
    volunteerNote: string | null;
    file: File | null;
    heroImage: File | null;
  },
): Promise<{ id: string }> {
  const item = await db.reviewItem.findUnique({
    where: { id: itemId },
    select: {
      submitterId: true,
      heroImageUrl: true,
      attachments: { select: { id: true, objectKey: true }, take: 1 },
    },
  });
  if (!item) throw new ReviewItemError(404, "Review item not found.");
  assertSubmitter(item, actingUser);

  if (input.contentType === KnowledgeContentType.case_study && !input.deidentificationConfirmed) {
    throw new ReviewItemError(400, "You must confirm all patient information has been de-identified.");
  }

  const categories = await db.knowledgeCategory.findMany({
    where: { id: { in: input.categoryIds } },
    select: { id: true },
  });
  if (categories.length !== input.categoryIds.length) {
    throw new ReviewItemError(400, "Select at least one valid category.");
  }

  const isRecordedLecture = input.contentType === KnowledgeContentType.recorded_lecture;
  if (isRecordedLecture && !input.youtubeUrl) {
    throw new ReviewItemError(400, "A YouTube URL is required for a recorded lecture.");
  }
  if (!isRecordedLecture && input.file && input.externalUrl) {
    throw new ReviewItemError(400, "Choose either a file upload or an external link, not both.");
  }
  const existingAttachment = item.attachments[0] ?? null;
  if (!isRecordedLecture && !input.file && !existingAttachment && !input.externalUrl) {
    throw new ReviewItemError(400, "A file upload or external link is required for this content type.");
  }

  let newAttachment: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number } | null = null;
  if (!isRecordedLecture && input.file) {
    try {
      newAttachment = await uploadKnowledgeDocument(input.file);
    } catch (error) {
      if (error instanceof UploadValidationError) throw new ReviewItemError(400, error.message);
      throw error;
    }
  }

  // Same "upload the replacement, then delete the old object afterward"
  // shape as updateKnowledgeItem's heroImageUrl handling — a new upload
  // replaces whatever's there; no new file provided keeps the existing one
  // as-is (there's no separate "remove image" action).
  let heroImageUrl = item.heroImageUrl;
  if (input.heroImage) {
    try {
      heroImageUrl = await uploadKnowledgeItemHeroImage(input.heroImage);
    } catch (error) {
      if (error instanceof UploadValidationError) throw new ReviewItemError(400, error.message);
      throw error;
    }
  }

  // Drop the old attachment when it's being replaced by a new file, when
  // contentType moved to recorded_lecture (which stores youtubeUrl instead),
  // or when the edit switches from a file to an external link.
  const dropsExistingAttachment =
    existingAttachment !== null &&
    (isRecordedLecture || newAttachment !== null || (!isRecordedLecture && input.externalUrl !== null));

  await db.$transaction(async (tx) => {
    await tx.reviewItemCategory.deleteMany({ where: { reviewItemId: itemId } });
    await tx.reviewItemTag.deleteMany({ where: { reviewItemId: itemId } });
    if (dropsExistingAttachment) {
      await tx.reviewItemAttachment.delete({ where: { id: existingAttachment!.id } });
    }
    await tx.reviewItem.update({
      where: { id: itemId },
      data: {
        title: input.title,
        description: input.description,
        contentType: input.contentType,
        level: input.level,
        youtubeUrl: isRecordedLecture ? input.youtubeUrl : null,
        heroImageUrl,
        externalUrl: isRecordedLecture ? null : input.externalUrl,
        deidentificationConfirmed: input.deidentificationConfirmed,
        volunteerNote: input.volunteerNote,
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
        attachments: newAttachment ? { create: [newAttachment] } : undefined,
      },
    });
  });

  if (input.heroImage && item.heroImageUrl) {
    await deleteKnowledgeItemHeroImage(item.heroImageUrl);
  }

  if (dropsExistingAttachment) {
    await deleteKnowledgeDocument(existingAttachment!.objectKey);
  }

  return { id: itemId };
}

/** /review-feedback/[id]/edit's data load — the full editable field set. Permission checked by the caller, same split as getKnowledgeItemForEdit. */
export async function getReviewItemForEdit(id: string): Promise<ReviewItemForEdit | null> {
  const item = await db.reviewItem.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      contentType: true,
      level: true,
      status: true,
      submitterId: true,
      seekingReviewers: true,
      volunteerNote: true,
      categories: { select: { categoryId: true } },
      tags: { select: { tagId: true } },
      youtubeUrl: true,
      heroImageUrl: true,
      externalUrl: true,
      deidentificationConfirmed: true,
      attachments: { select: { fileName: true, objectKey: true }, take: 1 },
    },
  });
  if (!item) return null;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    level: item.level,
    status: item.status,
    seekingReviewers: item.seekingReviewers,
    volunteerNote: item.volunteerNote,
    categoryIds: item.categories.map((c) => c.categoryId),
    tagIds: item.tags.map((t) => t.tagId),
    youtubeUrl: item.youtubeUrl,
    heroImageUrl: getKnowledgeItemHeroImageUrl(item.heroImageUrl),
    externalUrl: item.externalUrl,
    deidentificationConfirmed: item.deidentificationConfirmed,
    submitterId: item.submitterId,
    attachment: item.attachments[0]
      ? { fileName: item.attachments[0].fileName, url: getReviewDocumentUrl(item.attachments[0].objectKey) }
      : null,
  };
}

/** Submitter-only — deletes a submission and everything attached to it (cascades). */
export async function deleteReviewItem(itemId: string, actingUser: UserModel): Promise<void> {
  const item = await db.reviewItem.findUnique({ where: { id: itemId }, select: { submitterId: true } });
  if (!item) throw new ReviewItemError(404, "Review item not found.");
  assertSubmitter(item, actingUser);
  await db.reviewItem.delete({ where: { id: itemId } });
}

/**
 * PATCH /api/review-feedback/:id/invitees — mirrors updateKnowledgeItemInvitees,
 * minus the "item not visible yet" deferral (a ReviewItem is always visible
 * to its invitees the moment they're added, there's no moderation gate
 * hiding it first).
 */
export async function updateReviewItemInvitees(
  itemId: string,
  actingUser: UserModel,
  input: { addUserIds: string[]; removeUserIds: string[] },
): Promise<{ added: number; removed: number }> {
  const item = await db.reviewItem.findUnique({
    where: { id: itemId },
    select: { id: true, title: true, submitterId: true },
  });
  if (!item) throw new ReviewItemError(404, "Review item not found.");
  assertSubmitter(item, actingUser);

  const submitter = await db.user.findUnique({ where: { id: item.submitterId }, select: { name: true } });
  const submitterName = submitter?.name ?? "A member";

  const [addCandidates, alreadyInvited, removeCandidates] = await Promise.all([
    input.addUserIds.length > 0
      ? db.user.findMany({
          where: {
            id: { in: input.addUserIds, notIn: [item.submitterId] },
            tier: { in: DIRECTORY_TIERS },
            profile: { listInDirectory: true },
          },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([]),
    input.addUserIds.length > 0
      ? db.reviewItemInvitee.findMany({
          where: { reviewItemId: itemId, userId: { in: input.addUserIds } },
          select: { userId: true },
        })
      : Promise.resolve([]),
    input.removeUserIds.length > 0
      ? db.reviewItemInvitee.findMany({
          where: { reviewItemId: itemId, userId: { in: input.removeUserIds } },
          select: { userId: true, user: { select: { email: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const alreadyInvitedIds = new Set(alreadyInvited.map((row) => row.userId));
  const newInvitees = addCandidates.filter((user) => !alreadyInvitedIds.has(user.id));

  await db.$transaction(async (tx) => {
    if (newInvitees.length > 0) {
      await tx.reviewItemInvitee.createMany({
        data: newInvitees.map((user) => ({ reviewItemId: itemId, userId: user.id })),
      });
      await notifyInvitedReviewUsers(tx, {
        reviewItemId: itemId,
        title: item.title,
        submitterName,
        userIds: newInvitees.map((user) => user.id),
      });
    }

    if (removeCandidates.length > 0) {
      const removeIds = removeCandidates.map((row) => row.userId);
      await tx.reviewItemInvitee.deleteMany({ where: { reviewItemId: itemId, userId: { in: removeIds } } });

      const message = `You no longer have access to "${item.title}" in Peer Review & Feedback.`;
      await tx.notification.createMany({
        data: removeIds.map((userId) => ({
          recipientId: userId,
          type: NotificationType.peer_review_removed,
          message,
          // No link — a removed invitee's next request for the item 404s.
          link: null,
        })),
      });
    }
  });

  await Promise.all([
    emailInvitedReviewUsers(newInvitees, { reviewItemId: itemId, title: item.title, submitterName }),
    removeCandidates.length > 0
      ? Promise.allSettled(
          removeCandidates.map((row) =>
            sendReviewLifecycleEmail(row.user.email, row.user.name ?? "there", {
              subject: `Update: ${item.title}`,
              message: `You no longer have access to "${item.title}" in Peer Review & Feedback.`,
            }),
          ),
        )
      : Promise.resolve(),
  ]);

  return { added: newInvitees.length, removed: removeCandidates.length };
}

const MY_SUBMISSION_SELECT = {
  id: true,
  title: true,
  contentType: true,
  status: true,
  createdAt: true,
  categories: { select: { category: { select: { name: true } } } },
  invitees: {
    select: { user: { select: { name: true, profile: { select: { avatarUrl: true } } } } },
    orderBy: { createdAt: "asc" as const },
  },
  _count: {
    select: {
      comments: true,
      volunteerOffers: { where: { status: ReviewVolunteerStatus.pending } },
    },
  },
  comments: { select: { createdAt: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
  volunteerOffers: { select: { createdAt: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
};

/** true if the caller's last visit predates the item's latest comment/volunteer-offer activity. */
function hasNewActivitySince(
  viewedAt: Date | null,
  latestComment: { createdAt: Date } | undefined,
  latestOffer: { createdAt: Date } | undefined,
): boolean {
  const latest = [latestComment?.createdAt, latestOffer?.createdAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  if (!latest) return false;
  if (!viewedAt) return true;
  return latest.getTime() > viewedAt.getTime();
}

/** /review-feedback "My Submissions" tab. */
export async function getMySubmissions(userId: string): Promise<MyReviewSubmission[]> {
  const [items, views] = await Promise.all([
    db.reviewItem.findMany({
      where: { submitterId: userId },
      select: MY_SUBMISSION_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    db.reviewItemView.findMany({ where: { userId }, select: { reviewItemId: true, viewedAt: true } }),
  ]);
  const viewedAtById = new Map(views.map((v) => [v.reviewItemId, v.viewedAt]));

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    contentType: item.contentType,
    status: item.status,
    categories: item.categories.map(({ category }) => category),
    invitees: item.invitees.map(({ user }) => ({
      name: user.name,
      avatarUrl: getProfileAvatarUrl(user.profile?.avatarUrl ?? null),
    })),
    commentCount: item._count.comments,
    pendingOfferCount: item._count.volunteerOffers,
    createdAt: item.createdAt.toISOString(),
    hasNewActivity: hasNewActivitySince(viewedAtById.get(item.id) ?? null, item.comments[0], item.volunteerOffers[0]),
  }));
}

/** /review-feedback "Shared With Me" tab. */
export async function getSharedWithMe(userId: string): Promise<SharedReviewItem[]> {
  const [items, views, myComments] = await Promise.all([
    db.reviewItem.findMany({
      where: { invitees: { some: { userId } } },
      select: {
        id: true,
        title: true,
        contentType: true,
        status: true,
        createdAt: true,
        categories: { select: { category: { select: { name: true } } } },
        submitter: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
        _count: { select: { comments: true } },
        comments: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.reviewItemView.findMany({ where: { userId }, select: { reviewItemId: true, viewedAt: true } }),
    db.reviewComment.findMany({ where: { authorId: userId }, select: { reviewItemId: true }, distinct: ["reviewItemId"] }),
  ]);
  const viewedAtById = new Map(views.map((v) => [v.reviewItemId, v.viewedAt]));
  const commentedItemIds = new Set(myComments.map((c) => c.reviewItemId));

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    contentType: item.contentType,
    categories: item.categories.map(({ category }) => category),
    submitter: {
      id: item.submitter.id,
      name: item.submitter.name,
      avatarUrl: getProfileAvatarUrl(item.submitter.profile?.avatarUrl ?? null),
    },
    commentCount: item._count.comments,
    createdAt: item.createdAt.toISOString(),
    hasNewActivity: hasNewActivitySince(viewedAtById.get(item.id) ?? null, item.comments[0], undefined),
    needsMyFeedback: item.status === ReviewItemStatus.open && !commentedItemIds.has(item.id),
  }));
}

function buildCommentTree(
  comments: {
    id: string;
    body: string;
    authorId: string;
    author: { name: string | null; profile: { avatarUrl: string | null } | null };
    parentId: string | null;
    createdAt: Date;
    editedAt: Date | null;
    flagged: boolean;
    removed: boolean;
  }[],
): ReviewCommentNode[] {
  const nodes = new Map<string, ReviewCommentNode>(
    comments.map((comment) => [
      comment.id,
      {
        id: comment.id,
        body: comment.removed ? "[Removed by a moderator]" : comment.body,
        authorId: comment.authorId,
        authorName: comment.author.name,
        avatarUrl: getProfileAvatarUrl(comment.author.profile?.avatarUrl ?? null),
        createdAt: comment.createdAt.toISOString(),
        editedAt: comment.editedAt?.toISOString() ?? null,
        flagged: comment.flagged,
        removed: comment.removed,
        replies: [],
      },
    ]),
  );

  const roots: ReviewCommentNode[] = [];
  for (const comment of comments) {
    const node = nodes.get(comment.id)!;
    const parent = comment.parentId ? nodes.get(comment.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * /review-feedback/[id] detail page's data load — gated by
 * canPreviewReviewItem, 404s (not 403s) for a viewer who can't see even the
 * preview, same "don't confirm existence to a non-invitee" rationale as the
 * Library/Forums. A caller who clears canPreviewReviewItem but not the
 * stricter canViewReviewItem (i.e. any member browsing an open call they
 * weren't invited to) gets hasFullAccess: false back — attachment/
 * externalUrl/youtubeUrl/publishedKnowledgeItemId are nulled out, same
 * "material stays gated behind an accepted offer" listing-only shape as
 * getSeekingReviewersFeed — and the page renders an Offer-to-Review preview
 * instead of the full submission. Upserts the caller's ReviewItemView.viewedAt
 * to now for a full-access viewer only — unlike KnowledgeItemView (insert-once
 * visitor counter), this is a "last seen" timestamp powering the dashboard's
 * per-card "New" activity indicator, which a preview-only browser has no use for.
 */
export async function getReviewItemDetail(itemId: string, actingUser: UserModel): Promise<ReviewItemDetail | null> {
  const item = await db.reviewItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      description: true,
      contentType: true,
      level: true,
      status: true,
      seekingReviewers: true,
      volunteerNote: true,
      submitterId: true,
      submitter: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
      createdAt: true,
      youtubeUrl: true,
      heroImageUrl: true,
      externalUrl: true,
      deidentificationConfirmed: true,
      publishedKnowledgeItemId: true,
      publishedKnowledgeItem: { select: { status: true } },
      categories: { select: { category: { select: { name: true, slug: true } } } },
      tags: { select: { tag: { select: { name: true, slug: true } } } },
      attachments: { select: { fileName: true, mimeType: true, objectKey: true }, take: 1 },
      invitees: { select: { userId: true } },
      volunteerOffers: { where: { userId: actingUser.id }, select: { status: true } },
    },
  });
  if (!item) return null;
  if (!canPreviewReviewItem(item, actingUser)) return null;

  const hasFullAccess = canViewReviewItem(item, actingUser);

  if (hasFullAccess) {
    await db.reviewItemView.upsert({
      where: { reviewItemId_userId: { reviewItemId: itemId, userId: actingUser.id } },
      create: { reviewItemId: itemId, userId: actingUser.id },
      update: { viewedAt: new Date() },
    });
  }

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    level: item.level,
    status: item.status,
    seekingReviewers: item.seekingReviewers,
    volunteerNote: item.volunteerNote,
    categories: item.categories.map(({ category }) => category),
    tags: item.tags.map(({ tag }) => tag),
    submitter: {
      id: item.submitter.id,
      name: item.submitter.name,
      avatarUrl: getProfileAvatarUrl(item.submitter.profile?.avatarUrl ?? null),
    },
    createdAt: item.createdAt.toISOString(),
    youtubeUrl: hasFullAccess ? item.youtubeUrl : null,
    heroImageUrl: getKnowledgeItemHeroImageUrl(item.heroImageUrl),
    externalUrl: hasFullAccess ? item.externalUrl : null,
    attachment:
      hasFullAccess && item.attachments[0]
        ? {
            fileName: item.attachments[0].fileName,
            mimeType: item.attachments[0].mimeType,
            url: getReviewDocumentUrl(item.attachments[0].objectKey),
          }
        : null,
    deidentificationConfirmed: item.deidentificationConfirmed,
    publishedKnowledgeItemId: hasFullAccess ? item.publishedKnowledgeItemId : null,
    publishedKnowledgeItemStatus: hasFullAccess ? (item.publishedKnowledgeItem?.status ?? null) : null,
    isSubmitter: item.submitterId === actingUser.id,
    isInvitee: item.invitees.some((invitee) => invitee.userId === actingUser.id),
    hasFullAccess,
    myOfferStatus: item.volunteerOffers[0]?.status ?? null,
  };
}

/** Submitter-facing "Reviewers" roster, with a per-invitee has-commented flag. */
export async function getReviewItemRoster(itemId: string): Promise<ReviewItemRosterMember[]> {
  const [invitees, commenters] = await Promise.all([
    db.reviewItemInvitee.findMany({
      where: { reviewItemId: itemId },
      select: { userId: true, user: { select: { name: true, profile: { select: { avatarUrl: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.reviewComment.findMany({ where: { reviewItemId: itemId }, select: { authorId: true }, distinct: ["authorId"] }),
  ]);
  const commentedIds = new Set(commenters.map((c) => c.authorId));

  return invitees.map((invitee) => ({
    userId: invitee.userId,
    name: invitee.user.name,
    avatarUrl: getProfileAvatarUrl(invitee.user.profile?.avatarUrl ?? null),
    hasCommented: commentedIds.has(invitee.userId),
  }));
}

/**
 * POST /api/review-feedback/:id/comments — gated by canViewReviewItem,
 * notifies the submitter and every other invitee (not the author). Unlike
 * createForumPost, the audience here is already a closed set (submitter +
 * invitees), so there's no separate "other thread participants" derivation
 * or forum-follow suppression to layer on top — everyone who can see the
 * item gets notified of new activity in it.
 */
export async function postReviewComment(
  itemId: string,
  authorId: string,
  input: { body: string; parentId: string | null },
): Promise<{ id: string; createdAt: string }> {
  const item = await db.reviewItem.findUnique({
    where: { id: itemId },
    select: { id: true, title: true, submitterId: true, invitees: { select: { userId: true } } },
  });
  if (!item) throw new ReviewItemError(404, "Review item not found.");

  const actingUser = await db.user.findUnique({ where: { id: authorId } });
  if (!actingUser || !canViewReviewItem(item, actingUser)) {
    throw new ReviewItemError(404, "Review item not found.");
  }

  if (input.parentId) {
    const parent = await db.reviewComment.findUnique({ where: { id: input.parentId }, select: { reviewItemId: true } });
    if (!parent || parent.reviewItemId !== itemId) {
      throw new ReviewItemError(400, "That comment no longer exists.");
    }
  }

  const author = await db.user.findUnique({ where: { id: authorId }, select: { name: true } });

  // Knowledge Hours accounting: the *first* comment a real invitee (never
  // the submitter, never a moderator/admin just passing through) posts on
  // this item earns them 0.5 Hours, pending the submitter's confirmation
  // via the existing generic /contributions confirm flow — mirrors the
  // expert-consultation earn side (resolveMeetingRequest), not the
  // Library's admin-confirmed pattern, since here there's a natural
  // counterpart (the submitter). Checked/created inside the same
  // transaction as the comment itself so the two can never diverge.
  const isReviewer = item.invitees.some((invitee) => invitee.userId === authorId) && authorId !== item.submitterId;

  const comment = await db.$transaction(async (tx) => {
    const created = await tx.reviewComment.create({
      data: { reviewItemId: itemId, authorId, body: input.body, parentId: input.parentId },
    });

    if (isReviewer) {
      const priorCommentCount = await tx.reviewComment.count({
        where: { reviewItemId: itemId, authorId, id: { not: created.id } },
      });
      if (priorCommentCount === 0) {
        const rule = await tx.contributionRule.findUnique({ where: { activityKey: "review_feedback" } });
        if (rule && rule.active) {
          const event = await tx.contributionEvent.create({
            data: {
              ruleId: rule.id,
              actorId: authorId,
              counterpartId: item.submitterId,
              source: ContributionSource.review_feedback,
              note: `Peer review feedback: ${item.title}`,
              reviewCommentId: created.id,
            },
          });
          await tx.contributionLedger.create({
            data: {
              userId: authorId,
              eventId: event.id,
              type: LedgerTransactionType.earned,
              status: LedgerStatus.pending,
              hours: rule.hours,
            },
          });
          await createNotification(
            {
              recipientId: item.submitterId,
              type: NotificationType.contribution_confirmation_requested,
              message: `${author?.name ?? "A member"} earned ${rule.hours.toNumber()} Knowledge Hours reviewing "${item.title}" — please confirm.`,
              link: "/contributions",
            },
            tx,
          );
        }
      }
    }

    return created;
  });

  const recipientIds = new Set<string>();
  if (item.submitterId !== authorId) recipientIds.add(item.submitterId);
  for (const invitee of item.invitees) {
    if (invitee.userId !== authorId) recipientIds.add(invitee.userId);
  }

  if (recipientIds.size > 0) {
    const link = `/review-feedback/${itemId}#comment-${comment.id}`;
    const message = `${author?.name ?? "A member"} commented on "${item.title}".`;
    await db.notification.createMany({
      data: Array.from(recipientIds).map((recipientId) => ({
        recipientId,
        type: NotificationType.peer_review_comment,
        message,
        link,
      })),
    });
  }

  return { id: comment.id, createdAt: comment.createdAt.toISOString() };
}

/** Author or moderator/admin — edits an existing comment's body. Mirrors updateForumPost's authorization shape; a removed comment can't be edited. */
export async function updateReviewComment(commentId: string, actingUser: UserModel, body: string): Promise<{ id: string }> {
  const comment = await db.reviewComment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, removed: true },
  });
  if (!comment) throw new ReviewItemError(404, "Comment not found.");
  const isPrivileged = actingUser.role === Role.admin || actingUser.role === Role.moderator;
  if (comment.authorId !== actingUser.id && !isPrivileged) {
    throw new ReviewItemError(403, "Only the author or a moderator/admin can edit this comment.");
  }
  if (comment.removed) throw new ReviewItemError(400, "This comment has been removed.");

  await db.reviewComment.update({ where: { id: commentId }, data: { body, editedAt: new Date() } });
  return { id: commentId };
}

/** Detail page's comment thread — tree-assembled, same two-pass algorithm as getForumThreadDetail. */
export async function getReviewComments(itemId: string): Promise<ReviewCommentNode[]> {
  const comments = await db.reviewComment.findMany({
    where: { reviewItemId: itemId },
    select: {
      id: true,
      body: true,
      authorId: true,
      author: { select: { name: true, profile: { select: { avatarUrl: true } } } },
      parentId: true,
      createdAt: true,
      editedAt: true,
      flagged: true,
      removed: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return buildCommentTree(comments);
}

/** Author or moderator/admin — flags a comment for moderation review. */
export async function flagReviewComment(commentId: string, actingUser: UserModel, reason: string): Promise<{ id: string }> {
  const comment = await db.reviewComment.findUnique({
    where: { id: commentId },
    select: { id: true, reviewItem: { select: { submitterId: true, invitees: { select: { userId: true } } } } },
  });
  if (!comment) throw new ReviewItemError(404, "Comment not found.");
  if (!canViewReviewItem(comment.reviewItem, actingUser)) throw new ReviewItemError(404, "Comment not found.");

  await db.reviewComment.update({ where: { id: commentId }, data: { flagged: true, flagReason: reason } });
  return { id: commentId };
}

/**
 * Submitter-only — publishes a closed ReviewItem to the Knowledge Library,
 * copying its fields/categories/tags/attachments. The first publish creates
 * a new `pending_review` KnowledgeItem — Peer review doesn't bypass Steward
 * moderation on a first submission, same as any other Library item. Every
 * publish after that updates that *same* KnowledgeItem in place (by its
 * unique publishedKnowledgeItemId) instead of creating a duplicate, and —
 * mirroring updateKnowledgeItem's own "edits to an already-published item go
 * live immediately, no re-review; only a rejected item's edit re-enters the
 * queue" rule (lib/library-server.ts) — leaves status untouched unless it
 * was `rejected`, in which case it goes back to `pending_review`.
 */
export async function publishReviewItemToLibrary(itemId: string, actingUser: UserModel): Promise<{ knowledgeItemId: string; status: KnowledgeStatus }> {
  const item = await db.reviewItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      description: true,
      contentType: true,
      level: true,
      submitterId: true,
      youtubeUrl: true,
      heroImageUrl: true,
      externalUrl: true,
      deidentificationConfirmed: true,
      status: true,
      publishedKnowledgeItemId: true,
      categories: { select: { categoryId: true } },
      tags: { select: { tagId: true } },
      attachments: { select: { objectKey: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
  });
  if (!item) throw new ReviewItemError(404, "Review item not found.");
  assertSubmitter(item, actingUser);
  if (item.status !== ReviewItemStatus.closed) {
    throw new ReviewItemError(409, "Close this review before publishing it to the Knowledge Library.");
  }

  return db.$transaction(async (tx) => {
    if (item.publishedKnowledgeItemId) {
      const existing = await tx.knowledgeItem.findUniqueOrThrow({
        where: { id: item.publishedKnowledgeItemId },
        select: { status: true },
      });
      const nextStatus = existing.status === KnowledgeStatus.rejected ? KnowledgeStatus.pending_review : existing.status;

      await tx.knowledgeItemCategory.deleteMany({ where: { knowledgeItemId: item.publishedKnowledgeItemId } });
      await tx.knowledgeItemTag.deleteMany({ where: { knowledgeItemId: item.publishedKnowledgeItemId } });
      await tx.knowledgeAttachment.deleteMany({ where: { knowledgeItemId: item.publishedKnowledgeItemId } });
      await tx.knowledgeItem.update({
        where: { id: item.publishedKnowledgeItemId },
        data: {
          title: item.title,
          description: item.description,
          contentType: item.contentType,
          level: item.level,
          youtubeUrl: item.youtubeUrl,
          heroImageUrl: item.heroImageUrl,
          externalUrl: item.externalUrl,
          deidentificationConfirmed: item.deidentificationConfirmed,
          status: nextStatus,
          categories: { create: item.categories.map((c) => ({ categoryId: c.categoryId })) },
          tags: { create: item.tags.map((t) => ({ tagId: t.tagId })) },
          attachments: item.attachments.length > 0 ? { create: item.attachments } : undefined,
        },
      });
      return { knowledgeItemId: item.publishedKnowledgeItemId, status: nextStatus };
    }

    const knowledgeItem = await tx.knowledgeItem.create({
      data: {
        title: item.title,
        description: item.description,
        contentType: item.contentType,
        level: item.level,
        contributorId: item.submitterId,
        youtubeUrl: item.youtubeUrl,
        heroImageUrl: item.heroImageUrl,
        externalUrl: item.externalUrl,
        deidentificationConfirmed: item.deidentificationConfirmed,
        licenseConsented: true,
        status: KnowledgeStatus.pending_review,
        visibility: KnowledgeVisibility.public,
        categories: { create: item.categories.map((c) => ({ categoryId: c.categoryId })) },
        tags: { create: item.tags.map((t) => ({ tagId: t.tagId })) },
        attachments: item.attachments.length > 0 ? { create: item.attachments } : undefined,
      },
      select: { id: true },
    });

    await tx.reviewItem.update({ where: { id: itemId }, data: { publishedKnowledgeItemId: knowledgeItem.id } });
    return { knowledgeItemId: knowledgeItem.id, status: KnowledgeStatus.pending_review };
  });
}

// ===== Volunteer reviewers (open call) =====
// A submitter who doesn't know who to invite can open a call for
// volunteers (ReviewItem.seekingReviewers) instead of, or alongside,
// hand-picking invitees. Any directory-eligible member other than the
// submitter can offer to review (ReviewVolunteerOffer); the submitter
// accepts or declines each offer, and accepting converts it into a real
// ReviewItemInvitee via the same create+notify path createReviewItem and
// updateReviewItemInvitees already use.

/**
 * A member offers to review a `seekingReviewers` item they weren't directly
 * invited to. Upserts rather than always-creates so re-offering after a
 * prior withdrawn/declined offer reuses the same row (unique on
 * [reviewItemId, userId]) instead of erroring on the constraint.
 */
export async function offerToReview(itemId: string, userId: string, note: string | null): Promise<{ id: string }> {
  const item = await db.reviewItem.findUnique({
    where: { id: itemId },
    select: { id: true, title: true, submitterId: true, seekingReviewers: true },
  });
  if (!item) throw new ReviewItemError(404, "Review item not found.");
  if (!item.seekingReviewers) {
    throw new ReviewItemError(400, "This item isn't open for volunteer reviewers.");
  }
  if (item.submitterId === userId) {
    throw new ReviewItemError(400, "You can't volunteer to review your own submission.");
  }

  const volunteer = await db.user.findUnique({ where: { id: userId }, select: { name: true } });

  const offer = await db.reviewVolunteerOffer.upsert({
    where: { reviewItemId_userId: { reviewItemId: itemId, userId } },
    create: { reviewItemId: itemId, userId, note, status: ReviewVolunteerStatus.pending },
    update: { note, status: ReviewVolunteerStatus.pending, respondedAt: null },
    select: { id: true },
  });

  await createNotification({
    recipientId: item.submitterId,
    type: NotificationType.peer_review_volunteer_offered,
    message: `${volunteer?.name ?? "A member"} offered to review "${item.title}".`,
    link: `/review-feedback/${itemId}`,
  });

  return offer;
}

/** The volunteer withdraws their own offer — no-ops silently if there's no pending offer to withdraw. */
export async function withdrawVolunteerOffer(itemId: string, userId: string): Promise<void> {
  await db.reviewVolunteerOffer.updateMany({
    where: { reviewItemId: itemId, userId, status: ReviewVolunteerStatus.pending },
    data: { status: ReviewVolunteerStatus.withdrawn, respondedAt: new Date() },
  });
}

/**
 * Submitter-only — accept or decline a pending volunteer offer. Accept
 * reuses the exact create+notify shape updateReviewItemInvitees's add-path
 * uses (ReviewItemInvitee row + peer_review_invited notification + email),
 * so an accepted volunteer gets identical treatment to a directly-invited
 * member. Decline notifies the volunteer, not the submitter — the
 * submitter already knows, they're the one declining.
 */
export async function respondToVolunteerOffer(
  offerId: string,
  actingUser: UserModel,
  action: "accept" | "decline",
): Promise<{ id: string; status: ReviewVolunteerStatus }> {
  const offer = await db.reviewVolunteerOffer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      userId: true,
      status: true,
      user: { select: { email: true, name: true } },
      reviewItem: { select: { id: true, title: true, submitterId: true } },
    },
  });
  if (!offer) throw new ReviewItemError(404, "Volunteer offer not found.");
  assertSubmitter(offer.reviewItem, actingUser);
  if (offer.status !== ReviewVolunteerStatus.pending) {
    throw new ReviewItemError(409, "This offer has already been responded to.");
  }

  const submitter = await db.user.findUnique({ where: { id: offer.reviewItem.submitterId }, select: { name: true } });
  const submitterName = submitter?.name ?? "A member";

  if (action === "accept") {
    await db.$transaction(async (tx) => {
      await tx.reviewItemInvitee.upsert({
        where: { reviewItemId_userId: { reviewItemId: offer.reviewItem.id, userId: offer.userId } },
        create: { reviewItemId: offer.reviewItem.id, userId: offer.userId },
        update: {},
      });
      await tx.reviewVolunteerOffer.update({
        where: { id: offerId },
        data: { status: ReviewVolunteerStatus.accepted, respondedAt: new Date() },
      });
      await notifyInvitedReviewUsers(tx, {
        reviewItemId: offer.reviewItem.id,
        title: offer.reviewItem.title,
        submitterName,
        userIds: [offer.userId],
      });
    });
    await emailInvitedReviewUsers([offer.user], { reviewItemId: offer.reviewItem.id, title: offer.reviewItem.title, submitterName });
    return { id: offerId, status: ReviewVolunteerStatus.accepted };
  }

  await db.reviewVolunteerOffer.update({
    where: { id: offerId },
    data: { status: ReviewVolunteerStatus.declined, respondedAt: new Date() },
  });
  await createNotification({
    recipientId: offer.userId,
    type: NotificationType.peer_review_volunteer_declined,
    message: `Thanks for offering to review "${offer.reviewItem.title}" — this item found its reviewers.`,
    link: null,
  });
  await sendReviewLifecycleEmail(offer.user.email, offer.user.name ?? "there", {
    subject: `Update: ${offer.reviewItem.title}`,
    message: `Thanks for offering to review "${offer.reviewItem.title}" — this item found its reviewers.`,
  });
  return { id: offerId, status: ReviewVolunteerStatus.declined };
}

/** Submitter-only "Volunteer Offers" panel data — every currently-pending offer on this item. */
export async function getPendingVolunteerOffers(itemId: string): Promise<PendingVolunteerOffer[]> {
  const offers = await db.reviewVolunteerOffer.findMany({
    where: { reviewItemId: itemId, status: ReviewVolunteerStatus.pending },
    select: {
      id: true,
      userId: true,
      note: true,
      createdAt: true,
      user: { select: { name: true, profile: { select: { avatarUrl: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return offers.map((offer) => ({
    id: offer.id,
    userId: offer.userId,
    name: offer.user.name,
    avatarUrl: getProfileAvatarUrl(offer.user.profile?.avatarUrl ?? null),
    note: offer.note,
    createdAt: offer.createdAt.toISOString(),
  }));
}

/**
 * Submitter-only — opens or closes the volunteer call independently of
 * `status` (open/closed), so a submitter can stop new offers once they
 * have enough reviewers without closing the whole review, or open a call
 * later on an item that started as "Select Reviewers." Also bumps
 * lastActivityAt so the audience change resurfaces the item near the top
 * of the What's New feed, same "re-bump on new activity" convention as a
 * ForumThread reply.
 */
export async function toggleSeekingReviewers(itemId: string, actingUser: UserModel, value: boolean): Promise<{ id: string; seekingReviewers: boolean }> {
  const item = await db.reviewItem.findUnique({ where: { id: itemId }, select: { submitterId: true } });
  if (!item) throw new ReviewItemError(404, "Review item not found.");
  assertSubmitter(item, actingUser);

  const updated = await db.reviewItem.update({
    where: { id: itemId },
    data: { seekingReviewers: value, lastActivityAt: new Date() },
    select: { id: true, seekingReviewers: true },
  });
  return updated;
}

/**
 * /review-feedback "Members Seeking Reviewers" tab — community-wide, excludes
 * the viewer's own items (nothing to volunteer for on your own submission).
 */
export async function getSeekingReviewersFeed(viewerId: string): Promise<SeekingReviewersItem[]> {
  const items = await db.reviewItem.findMany({
    where: { seekingReviewers: true, status: ReviewItemStatus.open, submitterId: { not: viewerId } },
    select: {
      id: true,
      title: true,
      description: true,
      contentType: true,
      level: true,
      volunteerNote: true,
      createdAt: true,
      categories: { select: { category: { select: { name: true } } } },
      submitter: { select: { id: true, name: true, profile: { select: { avatarUrl: true } } } },
      _count: { select: { volunteerOffers: { where: { status: { not: ReviewVolunteerStatus.withdrawn } } } } },
      volunteerOffers: { where: { userId: viewerId }, select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    level: item.level,
    volunteerNote: item.volunteerNote,
    categories: item.categories.map(({ category }) => category),
    submitter: {
      id: item.submitter.id,
      name: item.submitter.name,
      avatarUrl: getProfileAvatarUrl(item.submitter.profile?.avatarUrl ?? null),
    },
    createdAt: item.createdAt.toISOString(),
    volunteerCount: item._count.volunteerOffers,
    myOfferStatus: item.volunteerOffers[0]?.status ?? null,
  }));
}
