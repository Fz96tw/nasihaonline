import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Pin } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getForumThreadDetail } from "@/lib/forums-server";
import { ForumThreadView } from "@/components/forums/forum-thread-view";
import { CLINICAL_DISCUSSIONS_SLUG } from "@/lib/forums";

export async function generateMetadata({
  params,
}: {
  params: { category: string; threadId: string };
}): Promise<Metadata> {
  const thread = await getForumThreadDetail(params.category, params.threadId);
  return { title: thread ? `${thread.title} — Forums — Nasiha` : "Thread not found — Nasiha" };
}

/** /forums/[category]/[threadId] (§4.13) — thread detail with threaded replies. */
export default async function ForumThreadPage({
  params,
}: {
  params: { category: string; threadId: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const thread = await getForumThreadDetail(params.category, params.threadId);
  if (!thread) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <div className="flex items-center gap-2">
          {thread.pinned && <Pin className="h-4 w-4 text-primary" />}
          <h1 className="text-2xl font-bold tracking-tight">{thread.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Started by {thread.authorName ?? "A member"} in{" "}
          <span className="font-medium text-foreground">{thread.forum.name}</span>
        </p>
      </div>

      <ForumThreadView
        threadId={thread.id}
        posts={thread.posts}
        requireDeidentification={thread.forum.slug === CLINICAL_DISCUSSIONS_SLUG}
      />
    </main>
  );
}
