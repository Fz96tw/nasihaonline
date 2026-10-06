import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getForumCategories } from "@/lib/forums-server";
import { getKnowledgeCategories } from "@/lib/library-server";
import { getAllCommunities, getOrCreateProfile } from "@/lib/profile-server";
import { NewThreadForm } from "@/components/forums/new-thread-form";
import { Role } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Create a Post",
};

/**
 * /post/new — the What's New compose button's destination. Presents posting
 * as a feed post with "Post to" / "Category" chips; underneath, the chips map
 * onto forums (getForumCategories already applies community gating and omits
 * inactive and system forums) and submit creates an ordinary forum thread,
 * after which the member lands back on the feed.
 */
export default async function NewPostPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const [forums, categories, communities, profile] = await Promise.all([
    getForumCategories(user.id, isPrivileged),
    getKnowledgeCategories(),
    getAllCommunities(),
    getOrCreateProfile(user.id),
  ]);
  // Default destination: General (everyone), else the first community-less
  // forum, else whatever the member can reach.
  const defaultForum =
    forums.find((forum) => forum.slug === "general") ??
    forums.find((forum) => forum.communityId === null) ??
    forums[0];
  if (!defaultForum) redirect("/whats-new");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold tracking-tight">Create a post</h1>
      <NewThreadForm
        variant="post"
        forumId={defaultForum.id}
        forums={forums}
        currentUserId={user.id}
        categories={categories}
        communities={communities}
        myCommunityIds={profile.communities.map((c) => c.community.id)}
      />
    </main>
  );
}
