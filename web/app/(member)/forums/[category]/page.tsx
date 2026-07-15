import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pin } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getForumBySlug } from "@/lib/forums-server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FollowForumButton } from "@/components/forums/follow-forum-button";

export const metadata: Metadata = {
  title: "Forums — Nasiha",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * /forums/[category] (§4.13) — a forum's thread list. `q` routes through
 * Meilisearch (§7.2/§9), same "real query goes to Meilisearch, browse
 * stays on Postgres" split as /library.
 */
export default async function ForumCategoryPage({
  params,
  searchParams,
}: {
  params: { category: string };
  searchParams: { q?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const result = await getForumBySlug(params.category, user.id, searchParams.q);
  if (!result) notFound();
  const { forum, threads, isFollowing } = result;

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{forum.name}</h1>
          {forum.description && <p className="text-muted-foreground">{forum.description}</p>}
        </div>
        <div className="flex gap-2">
          <FollowForumButton forumId={forum.id} initialFollowing={isFollowing} />
          <Button asChild>
            <Link href={`/forums/${forum.slug}/new`}>New Thread</Link>
          </Button>
        </div>
      </div>

      <form action={`/forums/${forum.slug}`} method="get" className="flex max-w-sm gap-2">
        <Input type="search" name="q" defaultValue={searchParams.q} placeholder="Search this forum…" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {threads.length === 0 ? (
        <p className="rounded-[10px] border p-8 text-center text-muted-foreground">
          {searchParams.q ? "No threads match your search." : "No threads yet — start the conversation."}
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-[10px] border">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/forums/${forum.slug}/${thread.id}`}
              className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-muted/40"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {thread.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                  <span className="font-medium">{thread.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {thread.authorName ?? "A member"} · {formatDate(thread.createdAt)}
                </span>
              </div>
              <Badge variant="neutral">
                {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
