import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Every gated or purely-functional tree in the app — mirrors the auth gates
// in middleware.ts's isProtectedPageRoute plus the (member) route group
// (calendar, contributions, dashboard, forums, inbox, library,
// my-communities, my-posts, profile, review-feedback, settings, whats-new)
// and the remaining auth/utility pages that have nothing to offer a crawler.
// Exception: Library item and forum thread detail pages are public.
const DISALLOWED_PATHS = [
  "/admin",
  "/api",
  "/inbox",
  "/settings",
  "/profile",
  "/dashboard",
  "/calendar",
  "/members",
  // /forums and /library: only the browse/compose/edit pages are blocked —
  // item and thread detail pages are public (SEO objective 789ae42a). `$`
  // anchors the browse roots so their detail subtrees stay crawlable. A
  // /forums/[category] browse page isn't listed (one-segment-only can't be
  // expressed here); it just redirects a crawler to the disallowed /sign-in.
  "/forums$",
  "/forums/*/new",
  "/forums/*/*/edit",
  "/contributions",
  "/whats-new",
  "/review-feedback",
  "/my-posts",
  "/my-communities",
  "/library$",
  "/library/new",
  "/library/mine",
  "/library/*/edit",
  "/meet",
  "/surveys",
  "/welcome",
  "/accept-invite",
  // Not /sign-in: every public page links to it, and it carries its own
  // `noindex, nofollow`, which crawlers can only read if they may fetch it.
  // Disallowing it left a disallowed link on every page and let Google index
  // the bare URL with no snippet (SEO objective cb64a262).
  "/account-suspended",
];

// Media on the public Library/forum detail pages (hero images, attachments,
// pasted images) — carved out of the /api disallow so crawlers can render
// and index the pages' images. Each route still enforces the same public
// readability rule itself.
const ALLOWED_PUBLIC_MEDIA_PATHS = [
  "/",
  "/api/library/hero/",
  "/api/library/document/",
  "/api/library/body-image/",
  "/api/forums/post-image/",
];

// AI crawlers — both live-search (OAI-SearchBot, PerplexityBot) and
// training (GPTBot, ClaudeBot, Google-Extended, CCBot, …) — get exactly
// the same rules as every other crawler via the `*` group: the 2026-11-06
// decision (objective bd5ab015) is to allow AI training on public content.
// No per-agent groups, since a named group would replace (not extend) `*`.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ALLOWED_PUBLIC_MEDIA_PATHS,
        disallow: DISALLOWED_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
