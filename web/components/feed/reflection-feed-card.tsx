"use client";

import Link from "next/link";
import { Eye, MessageSquare } from "lucide-react";
import type { FeedItem } from "@/lib/feed";
import { formatRelativeTime } from "@/lib/format-date";
import { Avatar } from "@/components/ui/avatar";
import { HighlightText } from "@/components/highlight-text";
import { ReflectionBackdrop } from "@/components/reflection/reflection-backdrop";

/**
 * A Weekly Reflection thread's own feed row: the post's image is the
 * background of the ENTIRE panel (edge to edge, no inner card) and everything
 * sits on it in white: author line, the quote large with attribution, the
 * prompt preview and the view/reply counts. The whole panel is one link to the
 * thread. Reply rows and every other thread keep the normal FeedRow layout.
 */
export function ReflectionFeedCard({ item, q }: { item: FeedItem & { reflectionCard: NonNullable<FeedItem["reflectionCard"]> }; q?: string }) {
  const card = item.reflectionCard;
  return (
    <li>
      <Link href={item.href} className="block w-full transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white">
        <ReflectionBackdrop imageUrl={card.imageUrl} className="flex min-h-[20rem] flex-col gap-4 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Avatar name={item.author.name ?? "NASIHA"} src={item.author.avatarUrl} size="sm" />
            <span className="truncate text-base font-medium">{item.author.name ?? "NASIHA"}</span>
            <span className="flex-shrink-0 rounded-full border border-white/40 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-white/90">
              Weekly Reflection
            </span>
            <span className="ml-auto flex-shrink-0 text-xs text-white/80">{formatRelativeTime(item.timestamp)}</span>
          </div>

          <div className="flex flex-1 flex-col justify-center py-2">
            <blockquote className="line-clamp-6 text-2xl font-semibold leading-snug [text-shadow:0_2px_12px_rgba(0,0,0,.6)] sm:text-3xl">
              &ldquo;<HighlightText text={card.quote} query={q} />&rdquo;
            </blockquote>
            {card.attribution && <p className="mt-3 text-sm text-white/90">&mdash; {card.attribution}</p>}
          </div>

          <div>
            {item.replyExcerpt && (
              <p className="line-clamp-2 text-sm text-white/90">
                <HighlightText text={item.replyExcerpt} query={q} />
              </p>
            )}
            {item.stats && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-white/80">
                <span className="flex items-center gap-1" title="Unique visitors">
                  <Eye className="h-3.5 w-3.5" />
                  {item.stats.views}
                </span>
                <span className="flex items-center gap-1" title="Comments">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {item.stats.comments}
                </span>
              </div>
            )}
          </div>
        </ReflectionBackdrop>
      </Link>
    </li>
  );
}
