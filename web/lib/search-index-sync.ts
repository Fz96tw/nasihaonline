// No "server-only" guard: imported directly by scripts/worker.ts and
// scripts/reindex-profiles.ts, which run outside Next's server runtime.
import { db } from "@/lib/db";
import {
  deleteProfileDocument,
  deletePostDocument,
  upsertPostDocument,
  upsertProfileDocument,
} from "@/lib/meilisearch";
import { DIRECTORY_TIERS } from "@/lib/members";
import { excerptFromHtml } from "@/lib/blog";

/**
 * Re-derives directory eligibility from the DB rather than trusting the
 * caller, so this stays correct regardless of which write path triggered it
 * (profile edit, avatar change, preference toggle, §4.3/§7.2). Ineligible
 * profiles (not listed, or a tier the Directory excludes — Friend, §4.5) are
 * removed from the index rather than left stale.
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
 * Re-derives publish state from the DB rather than trusting the caller,
 * same rationale as syncProfileToIndex — a post that's since been
 * unpublished (a future editing objective) is removed from the index
 * rather than left stale (§4.8/§7.2).
 */
export async function syncPostToIndex(postId: string): Promise<void> {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      author: { select: { name: true } },
      category: { select: { name: true, slug: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  if (!post || !post.publishedAt) {
    await deletePostDocument(postId);
    return;
  }

  await upsertPostDocument({
    id: post.id,
    title: post.title,
    excerpt: excerptFromHtml(post.body),
    authorName: post.author.name,
    categoryName: post.category.name,
    categorySlug: post.category.slug,
    tagNames: post.tags.map(({ tag }) => tag.name),
  });
}
