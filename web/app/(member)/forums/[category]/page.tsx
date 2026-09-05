import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Activity, Clock, Flame, Lock, Pin } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getForumBySlug } from "@/lib/forums-server";
import { ForumThreadVisibility, Role } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SortButton } from "@/components/forums/sort-button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Forums — NASIHA",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type ThreadSort = "recent" | "newest" | "active";

const THREAD_SORT_COOKIE = "forum_thread_sort";

const SORT_OPTIONS: { value: ThreadSort; label: string; icon: ReactNode }[] = [
  { value: "recent", label: "Recent activity", icon: <Activity className="h-4 w-4" /> },
  { value: "newest", label: "Newest", icon: <Clock className="h-4 w-4" /> },
  { value: "active", label: "Most active", icon: <Flame className="h-4 w-4" /> },
];

function isThreadSort(value: string | undefined): value is ThreadSort {
  return value === "recent" || value === "newest" || value === "active";
}

/**
 * /forums/[category] (§4.13) — a forum's thread list. Searching for a
 * specific thread by keyword is handled by the global nav search
 * (Meilisearch-backed) rather than a per-forum search box here. Sort
 * buttons re-order the fetched list via a `?sort=` param — getForumBySlug
 * already returns "recent activity" order (pinned first) as the default,
 * so "recent" here is a no-op re-sort; "newest"/"active" re-order by
 * createdAt/replyCount, still keeping pinned threads first.
 */
export default async function ForumCategoryPage({
  params,
  searchParams,
}: {
  params: { category: string };
  searchParams: { sort?: string; mine?: string; topic?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const result = await getForumBySlug(params.category, user.id, isPrivileged);
  if (!result) notFound();
  const { forum } = result;

  const requestedSort = isThreadSort(searchParams.sort) ? searchParams.sort : cookies().get(THREAD_SORT_COOKIE)?.value;
  const sort: ThreadSort = isThreadSort(requestedSort) ? requestedSort : "recent";
  const mine = searchParams.mine === "1";

  // community-based-categorization initiative, objective 6 — "Filter by
  // topic" chip row, options derived from the topics actually present on
  // this forum's already-loaded threads (no extra query, matching how few
  // distinct topics a single forum's threads realistically carry).
  const availableTopics = Array.from(
    new Map(result.threads.flatMap((thread) => thread.categories).map((topic) => [topic.id, topic])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const selectedTopic = availableTopics.find((topic) => topic.slug === searchParams.topic) ?? null;

  const threads = [...result.threads]
    .filter((thread) => !mine || thread.authorId === user.id)
    .filter((thread) => !selectedTopic || thread.categories.some((c) => c.id === selectedTopic.id))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      if (sort === "active") return b.replyCount - a.replyCount;
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });

  const sortHref = (value: ThreadSort) => {
    const qs = new URLSearchParams();
    if (value !== "recent") qs.set("sort", value);
    if (mine) qs.set("mine", "1");
    if (searchParams.topic) qs.set("topic", searchParams.topic);
    const query = qs.toString();
    return `/forums/${forum.slug}${query ? `?${query}` : ""}`;
  };

  const mineHref = (() => {
    const qs = new URLSearchParams();
    if (searchParams.sort) qs.set("sort", searchParams.sort);
    if (!mine) qs.set("mine", "1");
    if (searchParams.topic) qs.set("topic", searchParams.topic);
    const query = qs.toString();
    return `/forums/${forum.slug}${query ? `?${query}` : ""}`;
  })();

  const topicHref = (slug: string | null) => {
    const qs = new URLSearchParams();
    if (searchParams.sort) qs.set("sort", searchParams.sort);
    if (mine) qs.set("mine", "1");
    if (slug) qs.set("topic", slug);
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
          <Button asChild variant={mine ? "secondary" : "outline"}>
            <Link href={mineHref} scroll={false}>
              My Threads
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/forums/${forum.slug}/new`}>New Thread</Link>
          </Button>
        </div>
      </div>

      {availableTopics.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted-foreground">Filter by topic:</span>
          <Link
            href={topicHref(null)}
            scroll={false}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition-colors",
              !selectedTopic ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            All Topics
          </Link>
          {availableTopics.map((topic) => (
            <Link
              key={topic.id}
              href={topicHref(topic.slug)}
              scroll={false}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                selectedTopic?.id === topic.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {topic.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-sm text-muted-foreground">Sort:</span>
            {SORT_OPTIONS.map((option) => (
              <SortButton
                key={option.value}
                href={sortHref(option.value)}
                active={sort === option.value}
                label={option.label}
                icon={option.icon}
                cookieName={THREAD_SORT_COOKIE}
                cookieValue={option.value}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            Sorted by {SORT_OPTIONS.find((option) => option.value === sort)?.label}
          </span>
        </div>
      </div>

      {threads.length === 0 ? (
        <p className="rounded-[10px] border p-8 text-center text-muted-foreground">
          {selectedTopic
            ? "No threads match your filters."
            : mine
              ? "You haven't started any threads in this forum yet."
              : "No threads yet — start the conversation."}
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
                  {thread.visibility === ForumThreadVisibility.invited && (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="font-medium">{thread.title}</span>
                  {thread.categories.map((topic) => (
                    <Badge key={topic.id} variant="info">
                      {topic.name}
                    </Badge>
                  ))}
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
