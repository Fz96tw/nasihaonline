import Link from "next/link";
import { Eye, Hand, MessageSquare, Users } from "lucide-react";
import { type FeedItem, FEED_TYPE_LABELS } from "@/lib/feed";
import { formatRelativeTime, formatTimestamp } from "@/lib/format-date";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT } from "@/lib/members";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ReviewOfferButton } from "@/components/review/review-offer-button";
import { cn } from "@/lib/utils";

export function FeedRow({ item }: { item: FeedItem }) {
  const subtitle = [item.author.titleSpecialty, item.author.countryRegion].filter(Boolean).join(", ");
  // Forum threads always carry the same static default image (no per-thread
  // upload), so they get a small left-side thumbnail instead of the
  // full-width hero image other feed types render below their content.
  const isForumThread = item.type === "forum_thread";

  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50",
          item.reviewOfferPrompt && "pb-2",
        )}
      >
        {isForumThread && item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
          <img
            src={item.imageUrl}
            alt=""
            className="aspect-square w-[15%] flex-shrink-0 rounded-md object-cover"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-2">
            <Avatar name={item.author.name ?? "NASIHA Member"} src={item.author.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-medium">{item.author.name ?? "NASIHA Member"}</span>
                <Badge variant="neutral" className="flex-shrink-0">
                  {FEED_TYPE_LABELS[item.type]}
                </Badge>
                <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
              {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mt-2 flex items-center gap-2">
              <span className="text-base font-semibold">{item.title}</span>
              {item.titleTier && (
                <Badge variant={TIER_BADGE_VARIANT[item.titleTier]} className="flex-shrink-0">
                  {DIRECTORY_TIER_LABELS[item.titleTier]}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</div>
            {item.eventStartsAt && (
              <div className="mt-0.5 text-xs text-muted-foreground">Event Date: {formatTimestamp(item.eventStartsAt)}</div>
            )}
            {!isForumThread && item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
              <img
                src={item.imageUrl}
                alt=""
                className="mt-2 max-h-48 w-full rounded-md object-cover"
              />
            )}
            {item.stats && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
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
            {item.libraryViewCount !== undefined && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1" title="Unique visitors">
                  <Eye className="h-3.5 w-3.5" />
                  {item.libraryViewCount}
                </span>
                {item.forumReplyCount !== undefined && (
                  <span className="flex items-center gap-1" title="Discussion thread replies">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {item.forumReplyCount}
                  </span>
                )}
              </div>
            )}
            {item.attendeeCount !== undefined && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
                {item.eventViewCount !== undefined && (
                  <span className="flex items-center gap-1" title="Unique visitors">
                    <Eye className="h-3.5 w-3.5" />
                    {item.eventViewCount}
                  </span>
                )}
                <span className="flex items-center gap-1" title="Registered or RSVP'd">
                  <Users className="h-3.5 w-3.5" />
                  {item.attendeeCount}
                </span>
                {item.forumReplyCount !== undefined && (
                  <span className="flex items-center gap-1" title="Discussion thread replies">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {item.forumReplyCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
      {item.reviewOfferPrompt && (
        <div className="flex items-center justify-between gap-3 py-0 pl-[60px] pr-4 pb-4">
          <span className="flex items-center gap-1 text-xs font-medium text-primary">
            <Hand className="h-3.5 w-3.5" />
            {item.reviewOfferPrompt}
          </span>
          <ReviewOfferButton itemId={item.id} initialStatus={item.myOfferStatus ?? null} />
        </div>
      )}
    </li>
  );
}
