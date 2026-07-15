// No "server-only" guard here (unlike profile-server.ts/members-server.ts):
// this module is imported directly by standalone scripts (scripts/worker.ts,
// scripts/reindex-profiles.ts) that run outside Next's server runtime, same
// reason lib/db.ts and lib/clerk-admin.ts omit it.
import { Meilisearch } from "meilisearch";
import type { Tier, KnowledgeContentType, KnowledgeLevel } from "@/lib/generated/prisma/enums";

export const PROFILES_INDEX_NAME = "profiles";
export const POSTS_INDEX_NAME = "posts";
export const LIBRARY_INDEX_NAME = "knowledge_items";
export const FORUMS_INDEX_NAME = "forum_threads";

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

// Blog search document (§4.8/§7.2) — only ever written for published Posts
// (see syncPostToIndex); a post that reverts to unpublished is removed
// rather than left stale, same "re-derive eligibility, don't trust the
// caller" rule as ProfileSearchDocument.
export type PostSearchDocument = {
  id: string; // postId
  title: string;
  excerpt: string;
  authorName: string | null;
  categoryName: string;
  categorySlug: string;
  tagNames: string[];
};

// Library search document (§4.9/§7.2) — written for both `published` and
// `flagged` items (see syncKnowledgeItemToIndex — flagged items "stay
// visible," including in search, per the community-flagging model);
// `pending_review`/`rejected` items are removed rather than left stale,
// same rule as PostSearchDocument.
export type LibrarySearchDocument = {
  id: string; // knowledgeItemId
  title: string;
  description: string;
  contributorName: string | null;
  categoryName: string;
  categorySlug: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  tagNames: string[];
};

// Forum search document (§4.13/§7.2) — one document per thread, rather
// than one per post like PostSearchDocument's per-Post shape, since a
// thread's replies are all part of the same conversation a search hit
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

function getPostsIndex() {
  return getClient().index<PostSearchDocument>(POSTS_INDEX_NAME);
}

function getLibraryIndex() {
  return getClient().index<LibrarySearchDocument>(LIBRARY_INDEX_NAME);
}

function getForumsIndex() {
  return getClient().index<ForumSearchDocument>(FORUMS_INDEX_NAME);
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
export async function ensurePostsIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(POSTS_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getPostsIndex();
  await index.updateSearchableAttributes(["title", "excerpt", "authorName", "categoryName", "tagNames"]);
  await index.updateFilterableAttributes(["categorySlug"]);
}

export async function upsertPostDocument(document: PostSearchDocument): Promise<void> {
  await getPostsIndex().addDocuments([document]);
}

export async function deletePostDocument(postId: string): Promise<void> {
  await getPostsIndex().deleteDocument(postId);
}

export async function searchPostDocuments(
  query: string,
  options: { categorySlug?: string; limit?: number } = {},
): Promise<PostSearchDocument[]> {
  const result = await getPostsIndex().search(query, {
    limit: options.limit ?? 50,
    filter: options.categorySlug ? `categorySlug = "${options.categorySlug}"` : undefined,
  });
  return result.hits;
}

/** Same idempotent-settings rationale as ensureProfilesIndexConfigured. */
export async function ensureLibraryIndexConfigured(): Promise<void> {
  const client = getClient();
  await client.createIndex(LIBRARY_INDEX_NAME, { primaryKey: "id" }).catch(() => undefined);
  const index = getLibraryIndex();
  await index.updateSearchableAttributes(["title", "description", "contributorName", "categoryName", "tagNames"]);
  await index.updateFilterableAttributes(["contentType", "level", "categorySlug"]);
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
    options.categorySlug ? `categorySlug = "${options.categorySlug}"` : null,
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
