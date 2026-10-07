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
 * background of the ENTIRE panel (no inner banner; the panel itself is inset
 * as a rounded card with margin so it stands apart from the neighboring rows)
 * and everything sits on it in white: author line (the account's name and logo
 * already say what the post is, so there is no separate label), the quote large
 * with attribution, the prompt preview and the view/reply counts. The whole panel is one link to the
 * thread. Reply rows and every other thread keep the normal FeedRow layout.
 */
export function ReflectionFeedCard({ item, q }: { item: FeedItem & { reflectionCard: NonNullable<FeedItem["reflectionCard"]> }; q?: string }) {
  const card = item.reflectionCard;
  return (
    // Inset on every side (rather than edge to edge) so the divider lines of the
    // rows above and below stay visible and the panel reads as its own card.
    <li className="px-3 py-3 sm:px-4">
      <Link
        href={item.href}
        className="block w-full rounded-xl shadow-md ring-1 ring-black/15 transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <ReflectionBackdrop imageUrl={card.imageUrl} className="flex flex-col gap-3 rounded-xl px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Avatar name={item.author.name ?? "NASIHA"} src={item.author.avatarUrl} size="sm" />
            <span className="truncate text-base font-medium">{item.author.name ?? "NASIHA"}</span>
            <span className="ml-auto flex-shrink-0 text-xs text-white/80">{formatRelativeTime(item.timestamp)}</span>
          </div>

          <div>
            <blockquote className="line-clamp-6 text-2xl font-semibold leading-snug [text-shadow:0_2px_12px_rgba(0,0,0,.6)] sm:text-3xl">
              &ldquo;<HighlightText text={card.quote} query={q} />&rdquo;
            </blockquote>
            {card.attribution && <p className="mt-1.5 text-sm text-white/90">&mdash; {card.attribution}</p>}
          </div>

          {/* Prompt preview and counts share one row so they don't each add a line of height. */}
          {(item.replyExcerpt || item.stats) && (
            <div className="flex items-end justify-between gap-4">
              {item.replyExcerpt ? (
                <p className="line-clamp-2 min-w-0 flex-1 text-sm text-white/90">
                  <HighlightText text={item.replyExcerpt} query={q} />
                </p>
              ) : (
                <span />
              )}
              {item.stats && (
                <div className="flex flex-shrink-0 items-center gap-3 text-xs text-white/80">
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
          )}
        </ReflectionBackdrop>
      </Link>
    </li>
  );
}
