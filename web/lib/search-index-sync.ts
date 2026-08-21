// No "server-only" guard: imported directly by scripts/worker.ts and
// scripts/reindex-profiles.ts, which run outside Next's server runtime.
import { db } from "@/lib/db";
import {
  deleteProfileDocument,
  deleteLibraryDocument,
  deleteForumDocument,
  deleteEventDocument,
  deleteAnnouncementDocument,
  deleteSurveyDocument,
  deleteReviewItemDocument,
  upsertProfileDocument,
  upsertLibraryDocument,
  upsertForumDocument,
  upsertEventDocument,
  upsertAnnouncementDocument,
  upsertSurveyDocument,
  upsertReviewItemDocument,
} from "@/lib/meilisearch";
import { DIRECTORY_TIERS } from "@/lib/members";
import { KnowledgeStatus, SurveyStatus } from "@/lib/generated/prisma/enums";

/**
 * Re-derives directory eligibility from the DB rather than trusting the
 * caller, so this stays correct regardless of which write path triggered it
 * (profile edit, avatar change, preference toggle, §4.3/§7.2). Ineligible
 * profiles (not listed in the Directory, §4.3) are removed from the index
 * rather than left stale.
 */
export async function syncProfileToIndex(userId: string): Promise<void> {
  const profile = await db.profile.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, tier: true } },
      skills: { select: { skill: { select: { name: true } } } },
    },
  });

  const eligible =
    profile?.listInDirectory && profile.user.tier !== null && DIRECTORY_TIERS.includes(profile.user.tier);

  if (!eligible) {
    await deleteProfileDocument(userId);
    return;
  }

  await upsertProfileDocument({
    id: profile.userId,
    name: profile.user.name,
    tier: profile.user.tier,
    expertiseAreas: profile.expertiseAreas,
    skillNames: profile.skills.map(({ skill }) => skill.name),
    titleSpecialty: profile.showSpecialtyLocation ? profile.titleSpecialty : null,
    countryRegion: profile.showSpecialtyLocation ? profile.countryRegion : null,
  });
}

/**
 * Re-derives search eligibility from the DB rather than trusting the
 * caller, same "re-derive, don't trust" rule as syncProfileToIndex.
 * `published` and `flagged` are both eligible — flagged items "stay
 * visible" per the community-flagging model (§4.9), including in search;
 * `pending_review`/`rejected` are removed. Restricted-visibility items ARE
 * indexed (unlike the original per-domain search boxes' index-eligibility,
 * this no longer excludes them for everyone) — global search's
 * per-viewer authorization (lib/search-server.ts, mirroring
 * getPublishedKnowledgeItems' own visibility OR-clause) decides at query
 * time whether a given viewer gets to see a restricted hit, the same
 * "authorize at query time, not index time" split every other domain in
 * global search uses.
 */
export async function syncKnowledgeItemToIndex(knowledgeItemId: string): Promise<void> {
  const item = await db.knowledgeItem.findUnique({
    where: { id: knowledgeItemId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      visibility: true,
      contentType: true,
      level: true,
      contributor: { select: { name: true } },
      categories: { select: { category: { select: { name: true, slug: true } } } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  const eligible =
    item && (item.status === KnowledgeStatus.published || item.status === KnowledgeStatus.flagged);
  if (!eligible) {
    await deleteLibraryDocument(knowledgeItemId);
    return;
  }

  await upsertLibraryDocument({
    id: item.id,
    title: item.title,
    description: item.description,
    contributorName: item.contributor.name,
    categoryNames: item.categories.map(({ category }) => category.name),
    categorySlugs: item.categories.map(({ category }) => category.slug),
    contentType: item.contentType,
    level: item.level,
    tagNames: item.tags.map(({ tag }) => tag.name),
  });
}

/**
 * Re-derives the thread's full text from the DB rather than trusting the
 * caller — called from both createForumThread and createForumPost so a new
 * reply's text is reflected the next time the thread is re-synced, same
 * "re-derive, don't trust" rule as syncPostToIndex/syncKnowledgeItemToIndex.
 * Every thread is indexed regardless of restriction (`ForumThread.visibility`/
 * `ForumThreadInvitee`, or a restriction inherited from a linked Event/
 * KnowledgeItem) — per-viewer authorization for a restricted thread is
 * enforced at query time by lib/search-server.ts's global search (via
 * lib/forums-server.ts's isThreadVisible), not by excluding it here. The
 * only "not eligible" case is the thread no longer existing.
 */
export async function syncForumThreadToIndex(threadId: string): Promise<void> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      title: true,
      author: { select: { name: true } },
      forum: { select: { name: true, slug: true } },
      posts: { select: { body: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!thread) {
    await deleteForumDocument(threadId);
    return;
  }

  await upsertForumDocument({
    id: thread.id,
    title: thread.title,
    body: thread.posts.map((post) => post.body).join("\n\n"),
    authorName: thread.author.name,
    forumName: thread.forum.name,
    forumSlug: thread.forum.slug,
  });
}

/**
 * Re-derives from the DB rather than trusting the caller, same rule as
 * every sync* function above. Index-eligibility only excludes a cancelled
 * event — restricted (`invited`-visibility) events ARE indexed here;
 * per-viewer authorization (community/host/invitee/admin) is enforced at
 * query time by lib/search-server.ts's global search, mirroring
 * getMemberEventById's own where-clause, not by excluding restricted events
 * from the index for everyone.
 */
export async function syncEventToIndex(eventId: string): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      startsAt: true,
      cancelledAt: true,
      host: { select: { name: true } },
    },
  });

  if (!event || event.cancelledAt !== null) {
    await deleteEventDocument(eventId);
    return;
  }

  await upsertEventDocument({
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    hostName: event.host.name,
    startsAt: event.startsAt.toISOString(),
  });
}

/**
 * Re-derives from the DB rather than trusting the caller. Eligible only
 * once actually sent and not retracted/hidden from the feed — a verbatim
 * copy of lib/feed-server.ts's own Announcement where-clause, so search
 * visibility never drifts from feed visibility. No per-viewer gate exists
 * for Announcement (every real member sees the same set), so this is the
 * only eligibility check needed — nothing further happens at query time.
 */
export async function syncAnnouncementToIndex(announcementId: string): Promise<void> {
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId },
    select: { id: true, title: true, body: true, sentAt: true, retractedAt: true, showInFeed: true },
  });

  const eligible =
    announcement && announcement.sentAt !== null && announcement.retractedAt === null && announcement.showInFeed;
  if (!eligible) {
    await deleteAnnouncementDocument(announcementId);
    return;
  }

  await upsertAnnouncementDocument({
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
  });
}

/**
 * Re-derives from the DB rather than trusting the caller. Eligible once
 * `open` or `closed` (widened past feed-server.ts's `open`-only filter — a
 * closed survey is still legitimately findable/referenceable via search);
 * `draft`/`scheduled` surveys haven't gone out to anyone yet, so they're
 * excluded, same as feed-server.ts's own gate. `audienceMembers` mirrors
 * feed-server.ts's own gate too — it's not a per-viewer restriction (no
 * SurveyInvitation-based visibility gate exists, see lib/surveys-server.ts),
 * just whether members are part of the resolved audience at all.
 */
export async function syncSurveyToIndex(surveyId: string): Promise<void> {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, title: true, description: true, status: true, audienceMembers: true },
  });

  const eligible =
    survey &&
    (survey.status === SurveyStatus.open || survey.status === SurveyStatus.closed) &&
    survey.audienceMembers;
  if (!eligible) {
    await deleteSurveyDocument(surveyId);
    return;
  }

  await upsertSurveyDocument({
    id: survey.id,
    title: survey.title,
    description: survey.description,
    status: survey.status,
  });
}

/**
 * Re-derives from the DB rather than trusting the caller. Unlike every
 * other sync* function here, there's no index-eligibility exclusion at
 * all — a ReviewItem's submitter/invitee must be able to find their own
 * item via search regardless of status or seekingReviewers, so that
 * boolean logic (canViewReviewItem/canPreviewReviewItem, lib/review-server.ts)
 * is applied entirely at query time by lib/search-server.ts. The only
 * "not eligible" case is the item no longer existing (deleted).
 */
export async function syncReviewItemToIndex(reviewItemId: string): Promise<void> {
  const item = await db.reviewItem.findUnique({
    where: { id: reviewItemId },
    select: {
      id: true,
      title: true,
      description: true,
      contentType: true,
      level: true,
      volunteerNote: true,
      submitter: { select: { name: true } },
      categories: { select: { category: { select: { name: true } } } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  if (!item) {
    await deleteReviewItemDocument(reviewItemId);
    return;
  }

  await upsertReviewItemDocument({
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    level: item.level,
    categoryNames: item.categories.map(({ category }) => category.name),
    tagNames: item.tags.map(({ tag }) => tag.name),
    submitterName: item.submitter.name,
    volunteerNote: item.volunteerNote,
  });
}
