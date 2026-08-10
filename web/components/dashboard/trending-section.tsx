import Link from "next/link";
import { Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingCarousel } from "@/components/dashboard/trending-carousel";
import { getTrendingAnnouncements } from "@/lib/announcements-server";
import { getTrendingSurveys } from "@/lib/surveys-server";
import { getTrendingEvents } from "@/lib/events-server";
import { getTrendingLibraryItems } from "@/lib/library-server";
import { getTrendingPosts } from "@/lib/blog-server";
import { getTrendingForumThreads } from "@/lib/forums-server";

function formatUpdatedAgo(iso: string) {
  const days = Math.max(Math.round((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)), 0);
  if (days === 0) return "Updated today";
  return `Updated ${days}d ago`;
}

function formatViews(count: number) {
  return `${count} view${count === 1 ? "" : "s"} this month`;
}

function formatReplies(count: number) {
  return `${count} repl${count === 1 ? "y" : "ies"} this month`;
}

type TrendingCategory = {
  key: string;
  label: string;
  items: { id: string; title: string; href: string; metric: string }[];
};

/**
 * "What's Trending" — top 2-3 items per category over a rolling 30-day
 * window (view count where tracked, updatedAt where it isn't). Hidden
 * entirely if every category is empty, and each category card is hidden
 * individually if it has nothing in the window.
 */
export async function TrendingSection() {
  const [announcements, surveys, events, libraryItems, posts, forumThreads] = await Promise.all([
    getTrendingAnnouncements(),
    getTrendingSurveys(),
    getTrendingEvents(),
    getTrendingLibraryItems(),
    getTrendingPosts(),
    getTrendingForumThreads(),
  ]);

  const categories: TrendingCategory[] = [
    {
      key: "announcements",
      label: "Announcements",
      items: announcements.map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        href: `/whats-new/announcements/${announcement.id}`,
        metric: formatUpdatedAgo(announcement.updatedAt),
      })),
    },
    {
      key: "surveys",
      label: "Surveys",
      items: surveys.map((survey) => ({
        id: survey.id,
        title: survey.title,
        href: `/surveys/${survey.id}?ref=dashboard`,
        metric: formatUpdatedAgo(survey.updatedAt),
      })),
    },
    {
      key: "events",
      label: "Events",
      items: events.map((event) => ({
        id: event.id,
        title: event.title,
        href: `/calendar/${event.id}`,
        metric: formatViews(event.viewCount),
      })),
    },
    {
      key: "library",
      label: "Library",
      items: libraryItems.map((item) => ({
        id: item.id,
        title: item.title,
        href: `/library/${item.id}`,
        metric: formatViews(item.viewCount),
      })),
    },
    {
      key: "blog",
      label: "Blog",
      items: posts.map((post) => ({
        id: post.id,
        title: post.title,
        href: `/blog/${post.slug}`,
        metric: formatViews(post.viewCount),
      })),
    },
    {
      key: "forums",
      label: "Forums",
      items: forumThreads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        href: `/forums/${thread.forumSlug}/${thread.id}`,
        metric: formatReplies(thread.replyCount),
      })),
    },
  ].filter((category) => category.items.length > 0);

  if (categories.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
        <Flame className="h-6 w-6 text-warning sm:h-7 sm:w-7" />
        What&apos;s Trending
      </h2>
      <TrendingCarousel>
        {categories.map((category) => (
          <Card key={category.key} data-trending-card className="w-[80vw] max-w-xs shrink-0 snap-start sm:w-72">
            <CardHeader>
              <CardTitle className="text-base">{category.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                {category.items.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="block text-sm font-medium hover:underline">
                      {item.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{item.metric}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </TrendingCarousel>
    </section>
  );
}
