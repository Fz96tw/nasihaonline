import type { Metadata } from "next";
import { SITE_TITLE } from "@/lib/site";

/**
 * Per-page metadata for the public marketing pages. Next.js does not feed
 * the resolved document `title` into `openGraph.title` (they resolve
 * independently), and a page that sets `openGraph` at all replaces the root
 * layout's `openGraph` object wholesale rather than deep-merging into it —
 * so every field a page cares about (title, description, url, image) has to
 * be restated here rather than assumed inherited. Verified against a
 * production build: a page that sets `openGraph` without `images` loses the
 * site-wide default share card entirely (twitter:card falls back from
 * summary_large_image to summary) — it does not inherit the
 * opengraph-image.png file-convention default (objective 2).
 */
export function buildMetadata({
  title,
  description,
  path,
}: {
  title?: string;
  description: string;
  path: string;
}): Metadata {
  // Home page passes no `title` (keeps the layout's title.default rather
  // than running through the title template) — its openGraph/twitter title
  // falls back to the site title so og:title doesn't just disappear once
  // this page-level openGraph object replaces the layout's.
  const ogTitle = title ? `${title} — NASIHA` : SITE_TITLE;

  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: {
      title: ogTitle,
      description,
      url: path,
      images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: ["/twitter-image.png"],
    },
  };
}
