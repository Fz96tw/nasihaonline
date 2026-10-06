import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getForumBySlug, getForumCategories } from "@/lib/forums-server";
import { getKnowledgeCategories } from "@/lib/library-server";
import { getAllCommunities, getOrCreateProfile } from "@/lib/profile-server";
import { NewThreadForm } from "@/components/forums/new-thread-form";
import type { ForumCategory } from "@/lib/forums";
import { Role } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = {
  title: "New Thread",
};

/** /forums/[category]/new (§4.13) — "New Thread" form. */
export default async function NewForumThreadPage({ params }: { params: { category: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const result = await getForumBySlug(params.category, user.id, isPrivileged);
  if (!result) notFound();
  const { forum } = result;

  const [categories, communities, profile, accessibleForums] = await Promise.all([
    getKnowledgeCategories(),
    getAllCommunities(),
    getOrCreateProfile(user.id),
    getForumCategories(user.id, isPrivileged),
  ]);
  // The forum in the URL may be one the picker never lists (e.g. a system
  // forum reached by direct link) — keep it selectable so the form renders.
  const forums: ForumCategory[] = accessibleForums.some((f) => f.id === forum.id)
    ? accessibleForums
    : [...accessibleForums, { id: forum.id, name: forum.name, slug: forum.slug, description: forum.description, threadCount: 0, communityId: forum.communityId }];
  const myCommunityIds = profile.communities.map((c) => c.community.id);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Thread in {forum.name}</h1>
      </div>
      <NewThreadForm
        forumId={forum.id}
        forums={forums}
        currentUserId={user.id}
        categories={categories}
        communities={communities}
        myCommunityIds={myCommunityIds}
      />
    </main>
  );
}
