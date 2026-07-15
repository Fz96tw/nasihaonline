// No "server-only" guard here (unlike profile-server.ts/members-server.ts):
// this module is imported directly by standalone scripts (scripts/worker.ts,
// scripts/reindex-profiles.ts) that run outside Next's server runtime, same
// reason lib/db.ts and lib/clerk-admin.ts omit it.
import { Meilisearch } from "meilisearch";
import type { Tier } from "@/lib/generated/prisma/enums";

export const PROFILES_INDEX_NAME = "profiles";
export const POSTS_INDEX_NAME = "posts";

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
