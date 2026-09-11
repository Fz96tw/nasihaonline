import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Every gated or purely-functional tree in the app — mirrors the auth gates
// in middleware.ts's isProtectedPageRoute plus the (member) route group
// (calendar, contributions, dashboard, forums, inbox, library,
// my-communities, my-posts, profile, review-feedback, settings, whats-new)
// and the remaining auth/utility pages that have nothing to offer a crawler.
const DISALLOWED_PATHS = [
  "/admin",
  "/api",
  "/inbox",
  "/settings",
  "/profile",
  "/dashboard",
  "/calendar",
  "/members",
  "/forums",
  "/contributions",
  "/whats-new",
  "/review-feedback",
  "/my-posts",
  "/my-communities",
  "/library",
  "/meet",
  "/surveys",
  "/welcome",
  "/accept-invite",
  "/sign-in",
  "/account-suspended",
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
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
      ...AI_LIVE_SEARCH_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
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
