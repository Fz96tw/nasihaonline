import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Static public routes only, for now — content behind the membership wall
// stays gated per the public-content decision (objective 5 in seo-foundation
// is still pending; the interim call is to leave existing gated content as
// is). Dynamic entries (e.g. per-event pages) can be appended here once a
// route is deliberately made public.
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

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return STATIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
