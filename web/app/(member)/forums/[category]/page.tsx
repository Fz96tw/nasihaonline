import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Activity, Clock, Flame, Pin } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getForumBySlug } from "@/lib/forums-server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FollowForumButton } from "@/components/forums/follow-forum-button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Forums — NASIHA",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type ThreadSort = "recent" | "newest" | "active";

const SORT_OPTIONS: { value: ThreadSort; label: string; icon: typeof Clock }[] = [
  { value: "recent", label: "Recent activity", icon: Activity },
  { value: "newest", label: "Newest", icon: Clock },
  { value: "active", label: "Most active", icon: Flame },
];

/**
 * /forums/[category] (§4.13) — a forum's thread list. `q` routes through
 * Meilisearch (§7.2/§9), same "real query goes to Meilisearch, browse
 * stays on Postgres" split as /library. Sort buttons re-order the fetched
 * list via a `?sort=` param — getForumBySlug already returns "recent
 * activity" order (pinned first) as the default, so "recent" here is a
 * no-op re-sort; "newest"/"active" re-order by createdAt/replyCount,
 * still keeping pinned threads first.
 */
export default async function ForumCategoryPage({
  params,
  searchParams,
}: {
  params: { category: string };
  searchParams: { q?: string; sort?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const result = await getForumBySlug(params.category, user.id, searchParams.q);
  if (!result) notFound();
  const { forum, isFollowing } = result;

  const sort: ThreadSort =
    searchParams.sort === "newest" || searchParams.sort === "active" ? searchParams.sort : "recent";
  const threads = [...result.threads].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
    if (sort === "active") return b.replyCount - a.replyCount;
    return b.lastActivityAt.localeCompare(a.lastActivityAt);
  });

  const sortHref = (value: ThreadSort) => {
    const qs = new URLSearchParams();
    if (searchParams.q) qs.set("q", searchParams.q);
    if (value !== "recent") qs.set("sort", value);
    const query = qs.toString();
    return `/forums/${forum.slug}${query ? `?${query}` : ""}`;
  };

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/forums" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            All Forums
          </Link>
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <form action={`/forums/${forum.slug}`} method="get" className="flex max-w-sm gap-2">
          <Input type="search" name="q" defaultValue={searchParams.q} placeholder="Search this forum…" />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-sm text-muted-foreground">Sort:</span>
            {SORT_OPTIONS.map((option) => (
              <Button
                key={option.value}
                asChild
                variant={sort === option.value ? "secondary" : "ghost"}
                size="icon"
                className={cn("h-8 w-8", sort === option.value && "border")}
                title={option.label}
              >
                <Link href={sortHref(option.value)} aria-label={option.label}>
                  <option.icon className="h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            Sorted by {SORT_OPTIONS.find((option) => option.value === sort)?.label}
          </span>
        </div>
      </div>

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
              <div className="flex flex-col items-end gap-1">
                <Badge variant="neutral">
                  {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
                </Badge>
                <span className="text-xs text-muted-foreground">Active {formatDate(thread.lastActivityAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
