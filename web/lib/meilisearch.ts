// No "server-only" guard here (unlike profile-server.ts/members-server.ts):
// this module is imported directly by standalone scripts (scripts/worker.ts,
// scripts/reindex-profiles.ts) that run outside Next's server runtime, same
// reason lib/db.ts and lib/clerk-admin.ts omit it.
import { Meilisearch } from "meilisearch";
import type {
  Tier,
  KnowledgeContentType,
  KnowledgeLevel,
  EventType,
  SurveyStatus,
} from "@/lib/generated/prisma/enums";

export const PROFILES_INDEX_NAME = "profiles";
export const LIBRARY_INDEX_NAME = "knowledge_items";
export const FORUMS_INDEX_NAME = "forum_threads";
export const EVENTS_INDEX_NAME = "events";
export const ANNOUNCEMENTS_INDEX_NAME = "announcements";
export const SURVEYS_INDEX_NAME = "surveys";
export const REVIEW_ITEMS_INDEX_NAME = "review_items";

export type ProfileSearchDocument = {
  id: string; // userId
  name: string | null;
  tier: Tier | null;
  expertiseAreas: string[];
  // Tagged Skill names (§4.3/§7.3) — kept searchable alongside expertiseAreas
  // so a free-text match on e.g. "Cardiology" still works once that entry has
  // moved from the free-text fallback into a ProfileSkill link.
  skillNames: string[];
  titleSpecialty: string | null;
  countryRegion: string | null;
};

// Library search document (§4.9/§7.2) — written for both `published` and
// `flagged` items (see syncKnowledgeItemToIndex — flagged items "stay
// visible," including in search, per the community-flagging model);
// `pending_review`/`rejected` items are removed rather than left stale.
// Covers the blog_post content type too, folded in from the former
// standalone Blog domain's now-retired posts index.
export type LibrarySearchDocument = {
  id: string; // knowledgeItemId
  title: string;
  description: string;
  contributorName: string | null;
  categoryNames: string[];
  categorySlugs: string[];
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  tagNames: string[];
};

// Forum search document (§4.13/§7.2) — one document per thread, rather
// than one per post, since a thread's replies are all part of the same
// conversation a search hit
// should land on; `body` concatenates the opening post and every reply so
// a search matching only a reply's text still surfaces the thread.
// Written for every thread (no publish/review gate unlike LibrarySearchDocument
// — all forum content is visible to the full membership as soon as it's
// posted), and re-synced on every new reply so search never goes stale.
export type ForumSearchDocument = {
  id: string; // threadId
  title: string;
  body: string;
  authorName: string | null;
  forumName: string;
  forumSlug: string;
};

// Event search document (global search, Objective "Index Events,
// Announcements, Surveys, and Peer Review for search") — no visibility/
// invitee data carried here: unlike restricted-item exclusion elsewhere in
// this file, per-viewer authorization for Event happens at query time (see
// lib/search-server.ts), re-derived fresh from Postgres on every search
// rather than baked into the document. Only a cancelled event is excluded
// from the index itself (see syncEventToIndex).
export type EventSearchDocument = {
  id: string; // eventId
  title: string;
  description: string | null;
  type: EventType;
  hostName: string | null;
  startsAt: string; // ISO
};

// Announcement search document — no author field: the member-facing feed/
// detail always mask the sender as "NASIHA Board" (lib/feed-server.ts's
// ANNOUNCEMENT_SENDER), so search shouldn't carry the real admin's name
// either.
export type AnnouncementSearchDocument = {
  id: string; // announcementId
  title: string;
  body: string;
};

// Survey search document — status kept filterable so the UI can badge a
// closed survey; no per-member visibility gate exists for Survey (see
// lib/search-server.ts), so this is the same eligibility check used at
// both index- and query-time.
export type SurveySearchDocument = {
  id: string; // surveyId
  title: string;
  description: string | null;
  status: SurveyStatus;
};

// ReviewItem search document — shaped like LibrarySearchDocument (its
// natural sibling, pre-publication Library content). Unlike Library, no
// status/seekingReviewers gate at index time: a submitter/invitee must be
// able to find their own item via search regardless of status, so
// eligibility (canViewReviewItem/canPreviewReviewItem) is applied entirely
// at query time (lib/search-server.ts).
export type ReviewItemSearchDocument = {
  id: string; // reviewItemId
  title: string;
  description: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  categoryNames: string[];
  tagNames: string[];
  submitterName: string | null;
  volunteerNote: string | null;
};

const globalForMeilisearch = globalThis as unknown as {
  meilisearch: Meilisearch | undefined;
};

function getClient(): Meilisearch {
  if (!globalForMeilisearch.meilisearch) {
    globalForMeilisearch.meilisearch = new Meilisearch({
      host: process.env.MEILI_HOST ?? "http://localhost:7700",
      apiKey: process.env.MEILI_MASTER_KEY,
    });
  }
  return globalForMeilisearch.meilisearch;
}

function getProfilesIndex() {
  return getClient().index<ProfileSearchDocument>(PROFILES_INDEX_NAME);
}

function getLibraryIndex() {
  return getClient().index<LibrarySearchDocument>(LIBRARY_INDEX_NAME);
}

function getForumsIndex() {
  return getClient().index<ForumSearchDocument>(FORUMS_INDEX_NAME);
}

function getEventsIndex() {
  return getClient().index<EventSearchDocument>(EVENTS_INDEX_NAME);
}

function getAnnouncementsIndex() {
  return getClient().index<AnnouncementSearchDocument>(ANNOUNCEMENTS_INDEX_NAME);
}

function getSurveysIndex() {
  return getClient().index<SurveySearchDocument>(SURVEYS_INDEX_NAME);
}

function getReviewItemsIndex() {
  return getClient().index<ReviewItemSearchDocument>(REVIEW_ITEMS_INDEX_NAME);
}

/**
 * Idempotent index settings — safe to call on every worker boot. Meilisearch
 * auto-creates the index on first document write, but searchable/filterable
 * attributes need to be configured explicitly (§7.2).
 */
export async function ensureProfilesIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(PROFILES_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getProfilesIndex();
  await index.updateSearchableAttributes([
    "name",
    "titleSpecialty",
    "countryRegion",
    "expertiseAreas",
    "skillNames",
  ]);
  await index.updateFilterableAttributes(["tier"]);
}

export async function upsertProfileDocument(document: ProfileSearchDocument): Promise<void> {
  await getProfilesIndex().addDocuments([document]);
}

export async function deleteProfileDocument(userId: string): Promise<void> {
  await getProfilesIndex().deleteDocument(userId);
}

export async function searchProfileDocuments(query: string, limit = 50): Promise<ProfileSearchDocument[]> {
  const result = await getProfilesIndex().search(query, { limit });
  return result.hits;
}

/** Same idempotent-settings rationale as ensureProfilesIndexConfigured. */
export async function ensureLibraryIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(LIBRARY_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getLibraryIndex();
  await index.updateSearchableAttributes(["title", "description", "contributorName", "categoryNames", "tagNames"]);
  await index.updateFilterableAttributes(["contentType", "level", "categorySlugs"]);
}

export async function upsertLibraryDocument(document: LibrarySearchDocument): Promise<void> {
  await getLibraryIndex().addDocuments([document]);
}

export async function deleteLibraryDocument(knowledgeItemId: string): Promise<void> {
  await getLibraryIndex().deleteDocument(knowledgeItemId);
}

export async function searchLibraryDocuments(
  query: string,
  options: { contentType?: string; level?: string; categorySlug?: string; limit?: number } = {},
): Promise<LibrarySearchDocument[]> {
  const filters = [
    options.contentType ? `contentType = "${options.contentType}"` : null,
    options.level ? `level = "${options.level}"` : null,
    options.categorySlug ? `categorySlugs = "${options.categorySlug}"` : null,
  ].filter((clause): clause is string => clause != null);

  const result = await getLibraryIndex().search(query, {
    limit: options.limit ?? 50,
    filter: filters.length > 0 ? filters.join(" AND ") : undefined,
  });
  return result.hits;
}

/** Same idempotent-settings rationale as ensureProfilesIndexConfigured. */
export async function ensureForumsIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(FORUMS_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getForumsIndex();
  await index.updateSearchableAttributes(["title", "body", "authorName", "forumName"]);
  await index.updateFilterableAttributes(["forumSlug"]);
}

export async function upsertForumDocument(document: ForumSearchDocument): Promise<void> {
  await getForumsIndex().addDocuments([document]);
}

export async function deleteForumDocument(threadId: string): Promise<void> {
  await getForumsIndex().deleteDocument(threadId);
}

export async function searchForumDocuments(
  query: string,
  options: { forumSlug?: string; limit?: number } = {},
): Promise<ForumSearchDocument[]> {
  const result = await getForumsIndex().search(query, {
    limit: options.limit ?? 50,
    filter: options.forumSlug ? `forumSlug = "${options.forumSlug}"` : undefined,
  });
  return result.hits;
}

/** Same idempotent-settings rationale as ensureProfilesIndexConfigured. */
export async function ensureEventsIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(EVENTS_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getEventsIndex();
  await index.updateSearchableAttributes(["title", "description", "hostName"]);
  await index.updateFilterableAttributes(["type"]);
}

export async function upsertEventDocument(document: EventSearchDocument): Promise<void> {
  await getEventsIndex().addDocuments([document]);
}

export async function deleteEventDocument(eventId: string): Promise<void> {
  await getEventsIndex().deleteDocument(eventId);
}

export async function searchEventDocuments(
  query: string,
  options: { type?: string; limit?: number } = {},
): Promise<EventSearchDocument[]> {
  const result = await getEventsIndex().search(query, {
    limit: options.limit ?? 50,
    filter: options.type ? `type = "${options.type}"` : undefined,
  });
  return result.hits;
}

/** Same idempotent-settings rationale as ensureProfilesIndexConfigured. */
export async function ensureAnnouncementsIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(ANNOUNCEMENTS_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getAnnouncementsIndex();
  await index.updateSearchableAttributes(["title", "body"]);
}

export async function upsertAnnouncementDocument(document: AnnouncementSearchDocument): Promise<void> {
  await getAnnouncementsIndex().addDocuments([document]);
}

export async function deleteAnnouncementDocument(announcementId: string): Promise<void> {
  await getAnnouncementsIndex().deleteDocument(announcementId);
}

export async function searchAnnouncementDocuments(
  query: string,
  limit = 50,
): Promise<AnnouncementSearchDocument[]> {
  const result = await getAnnouncementsIndex().search(query, { limit });
  return result.hits;
}

/** Same idempotent-settings rationale as ensureProfilesIndexConfigured. */
export async function ensureSurveysIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(SURVEYS_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getSurveysIndex();
  await index.updateSearchableAttributes(["title", "description"]);
  await index.updateFilterableAttributes(["status"]);
}

export async function upsertSurveyDocument(document: SurveySearchDocument): Promise<void> {
  await getSurveysIndex().addDocuments([document]);
}

export async function deleteSurveyDocument(surveyId: string): Promise<void> {
  await getSurveysIndex().deleteDocument(surveyId);
}

export async function searchSurveyDocuments(
  query: string,
  options: { status?: string; limit?: number } = {},
): Promise<SurveySearchDocument[]> {
  const result = await getSurveysIndex().search(query, {
    limit: options.limit ?? 50,
    filter: options.status ? `status = "${options.status}"` : undefined,
  });
  return result.hits;
}

/** Same idempotent-settings rationale as ensureProfilesIndexConfigured. */
export async function ensureReviewItemsIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(REVIEW_ITEMS_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getReviewItemsIndex();
  await index.updateSearchableAttributes([
    "title",
    "description",
    "submitterName",
    "categoryNames",
    "tagNames",
    "volunteerNote",
  ]);
  await index.updateFilterableAttributes(["contentType", "level"]);
}

export async function upsertReviewItemDocument(document: ReviewItemSearchDocument): Promise<void> {
  await getReviewItemsIndex().addDocuments([document]);
}

export async function deleteReviewItemDocument(reviewItemId: string): Promise<void> {
  await getReviewItemsIndex().deleteDocument(reviewItemId);
}

export async function searchReviewItemDocuments(
  query: string,
  options: { contentType?: string; level?: string; limit?: number } = {},
): Promise<ReviewItemSearchDocument[]> {
  const filters = [
    options.contentType ? `contentType = "${options.contentType}"` : null,
    options.level ? `level = "${options.level}"` : null,
  ].filter((clause): clause is string => clause != null);

  const result = await getReviewItemsIndex().search(query, {
    limit: options.limit ?? 50,
    filter: filters.length > 0 ? filters.join(" AND ") : undefined,
  });
  return result.hits;
}
