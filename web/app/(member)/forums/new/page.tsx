import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getForumCategories } from "@/lib/forums-server";
import { getAllCommunities } from "@/lib/profile-server";
import { groupForumsByCommunity, type ForumCategory } from "@/lib/forums";
import { Role } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Start a Discussion",
};

function ForumOptionList({ forums }: { forums: ForumCategory[] }) {
  return (
    <div className="divide-y rounded-lg border">
      {forums.map((forum) => (
        <Link
          key={forum.id}
          href={`/forums/${forum.slug}/new`}
          className="flex flex-col px-4 py-3 transition-colors hover:bg-muted/50"
        >
          <span className="font-medium">{forum.name}</span>
          {forum.description && <span className="text-sm text-muted-foreground">{forum.description}</span>}
        </Link>
      ))}
    </div>
  );
}

/**
 * /forums/new — destination picker for the What's New compose button. Lists
 * only forums the member can access (getForumCategories applies the same
 * community gating as /forums, and omits inactive and system forums),
 * sectioned like /forums: General Topics first, then each community.
 */
export default async function NewDiscussionPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const [forums, communities] = await Promise.all([getForumCategories(user.id, isPrivileged), getAllCommunities()]);
  const { general, groups } = groupForumsByCommunity(forums, communities);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Where do you want to post?</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a forum for your new thread.</p>
      </div>
      {general.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">General Topics</h2>
          <ForumOptionList forums={general} />
        </section>
      )}
      {groups.map((group) => (
        <section key={group.community.id}>
          <h2 className="mb-3 text-lg font-semibold">{group.community.name}</h2>
          <ForumOptionList forums={group.forums} />
        </section>
      ))}
    </main>
  );
}
