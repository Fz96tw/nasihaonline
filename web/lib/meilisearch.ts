// No "server-only" guard here (unlike profile-server.ts/members-server.ts):
// this module is imported directly by standalone scripts (scripts/worker.ts,
// scripts/reindex-profiles.ts) that run outside Next's server runtime, same
// reason lib/db.ts and lib/clerk-admin.ts omit it.
import { Meilisearch } from "meilisearch";
import type { Tier } from "@/lib/generated/prisma/enums";

export const PROFILES_INDEX_NAME = "profiles";

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
