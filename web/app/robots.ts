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
  "/sign-in",
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

// AI-crawler allow/disallow follows objective 2's own documented fallback
// ("typical stance: allow the live-search bots, disallow the training-only
// bots") because objective 5 — the product/leadership decision spike on
// AI/LLM use — hasn't landed yet. Revisit once that decision doc exists.
const AI_LIVE_SEARCH_AGENTS = ["OAI-SearchBot", "PerplexityBot"];
const AI_TRAINING_AGENTS = ["GPTBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "CCBot", "Bytespider"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ALLOWED_PUBLIC_MEDIA_PATHS,
        disallow: DISALLOWED_PATHS,
      },
      ...AI_LIVE_SEARCH_AGENTS.map((userAgent) => ({
        userAgent,
        allow: ALLOWED_PUBLIC_MEDIA_PATHS,
        disallow: DISALLOWED_PATHS,
      })),
      ...AI_TRAINING_AGENTS.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
