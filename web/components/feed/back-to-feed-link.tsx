import { isFromFeed } from "@/lib/feed";
import { BackLink } from "@/components/back-link";

/**
 * The destination pages this appears on (calendar, library, survey respond)
 * are also reachable directly (nav, magic link), so this only renders when
 * the visit's ?ref=whats-new marks it as having actually come from there
 * (see lib/feed.ts's withFeedRef) — otherwise there'd be nothing sensible
 * to go "back" to.
 */
export function BackToFeedLink({
  searchParams,
  className,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
  className?: string;
}) {
  if (!isFromFeed(searchParams)) return null;

  return <BackLink fallbackHref="/whats-new" className={className ?? "mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"} />;
}
