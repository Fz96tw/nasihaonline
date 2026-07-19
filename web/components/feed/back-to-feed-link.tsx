import Link from "next/link";
import { isFromFeed } from "@/lib/feed";

/**
 * The destination pages this appears on (blog post, forum thread, calendar,
 * library) are all reachable from places other than the feed too, so this
 * only renders when the visit's ?ref=whats-new marks it as having actually
 * come from there (see lib/feed.ts's withFeedRef).
 */
export function BackToFeedLink({
  searchParams,
  className,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
  className?: string;
}) {
  if (!isFromFeed(searchParams)) return null;

  return (
    <Link href="/whats-new" className={className ?? "mb-6 inline-block text-sm text-muted-foreground hover:underline"}>
      ← Back to What&apos;s New
    </Link>
  );
}
