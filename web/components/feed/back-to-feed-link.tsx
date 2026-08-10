import { isFromFeed } from "@/lib/feed";
import { BackLink } from "@/components/back-link";

/**
 * The destination pages this appears on (calendar, library) are reachable
 * from several places (nav, dashboard widgets, the What's New feed), so
 * there's no single fixed "back" destination to hardcode. When the visit's
 * ?ref=whats-new marks it as having actually come from there (see
 * lib/feed.ts's withFeedRef), fall back to the feed; otherwise fall back to
 * the dashboard. Either way BackLink prefers real browser history over the
 * fallback, so this correctly returns wherever the visit actually started.
 */
export function BackToFeedLink({
  searchParams,
  className,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
  className?: string;
}) {
  const fallbackHref = isFromFeed(searchParams) ? "/whats-new" : "/dashboard";

  return <BackLink fallbackHref={fallbackHref} className={className ?? "mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"} />;
}
