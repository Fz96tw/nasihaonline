import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getPublicKnowledgeItemSitemapEntries } from "@/lib/library-server";
import { getPublicForumThreadSitemapEntries } from "@/lib/forums-server";
import { getPublicEventSitemapEntries } from "@/lib/events-server";

// Built per request (the DB isn't reachable during the Docker image build),
// like the (member) route group's own force-dynamic.
export const dynamic = "force-dynamic";

// Static public routes, plus every publicly readable Library item and
// (indexable — see isIndexableForumThread) forum thread detail page (SEO objective 789ae42a, 2026-11-06 decision: those
// detail pages are open to the web; the browse pages stay members-only).
// The eligibility rule lives in PUBLIC_KNOWLEDGE_ITEM_WHERE /
// PUBLIC_FORUM_THREAD_WHERE, shared with the pages themselves.
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about/research-curation", changeFrequency: "monthly", priority: 0.6 },
  { path: "/about/teaching-sharing", changeFrequency: "monthly", priority: 0.6 },
  { path: "/about/peer-review-feedback", changeFrequency: "monthly", priority: 0.6 },
  { path: "/our-team", changeFrequency: "monthly", priority: 0.6 },
  { path: "/events", changeFrequency: "daily", priority: 0.7 },
  { path: "/communities", changeFrequency: "weekly", priority: 0.6 },
  { path: "/join", changeFrequency: "monthly", priority: 0.9 },
  { path: "/getinvolved", changeFrequency: "monthly", priority: 0.7 },
  { path: "/donate", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // No lastModified on static routes: there's no real edit date to report,
  // and stamping each request's time made every fetch claim all 13 pages
  // just changed — which teaches Google to ignore lastmod sitemap-wide,
  // including the genuine dates on the item/thread entries below
  // (objective 441369e6).
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    // The homepage as SITE_URL, no trailing slash: that's the form Next.js
    // emits for its canonical and og:url, and all three should agree (SEO
    // objective cb64a262).
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));

  // A DB hiccup degrades to the static sitemap rather than a 500, which
  // would make search engines drop the whole file.
  const [libraryItems, forumThreads, events] = await Promise.all([
    getPublicKnowledgeItemSitemapEntries().catch((error) => {
      console.error("[sitemap] Failed to load public library items", error);
      return [];
    }),
    getPublicForumThreadSitemapEntries().catch((error) => {
      console.error("[sitemap] Failed to load public forum threads", error);
      return [];
    }),
    // Every event a visitor can open, past ones included: they drop off the
    // /events listing once over, so this is how crawlers keep finding them
    // (SEO objective 51c2e8d6).
    getPublicEventSitemapEntries().catch((error) => {
      console.error("[sitemap] Failed to load public events", error);
      return [];
    }),
  ]);

  return [
    ...staticEntries,
    ...libraryItems.map((item) => ({
      url: `${SITE_URL}/library/${item.id}`,
      lastModified: item.lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...forumThreads.map((thread) => ({
      url: `${SITE_URL}/forums/${thread.forumSlug}/${thread.id}`,
      lastModified: thread.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...events.map((event) => ({
      url: `${SITE_URL}/events/${event.id}`,
      lastModified: event.lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
