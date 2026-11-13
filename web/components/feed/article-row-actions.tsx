"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";
import { FROM_THE_WEB_FORUM_SLUG } from "@/lib/forums";
import { withFeedRef, type FeedItem } from "@/lib/feed";

/**
 * Footer under a "From the Web" feed row: the external "Read on {source}"
 * link plus the article's discussion — a link once a thread exists, or a
 * Discuss button that starts one (any member; idempotent server-side) and
 * opens it.
 */
export function ArticleRowActions({ article }: { article: NonNullable<FeedItem["article"]> }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDiscussion() {
    setStarting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/curated-articles/${article.articleId}/discussion`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || typeof payload?.threadId !== "string") {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't start the discussion.");
      }
      router.push(withFeedRef(`/forums/${FROM_THE_WEB_FORUM_SLUG}/${payload.threadId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the discussion.");
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <span className="truncate">Read on {article.sourceName}</span>
        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <div className="flex flex-col items-end gap-1">
        {article.threadHref ? (
          <Button asChild size="sm" variant="outline">
            <Link href={article.threadHref}>
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Discuss{article.replyCount > 0 ? ` (${article.replyCount})` : ""}
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={startDiscussion} disabled={starting}>
            <MessageSquare className="mr-1.5 h-4 w-4" />
            {starting ? "Starting…" : "Discuss"}
          </Button>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
