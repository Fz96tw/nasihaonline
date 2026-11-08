import type { Metadata } from "next";

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
  /**
   * The complete document title, "NASIHA" included — applied as
   * `title.absolute`, so the root layout's "%s — NASIHA" template is
   * bypassed and can't double the brand name. Written per page for search
   * results (SEO objective 2: 45–60 chars, one "NASIHA", a descriptive
   * keyword); og:title/twitter:title reuse it verbatim so they never drift.
   */
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/twitter-image.png"],
    },
  };
}
