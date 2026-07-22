import Link from "next/link";
import { Eye, MessageSquare, Users } from "lucide-react";
import { type FeedItem, FEED_TYPE_LABELS } from "@/lib/feed";
import { formatRelativeTime, formatTimestamp } from "@/lib/format-date";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function FeedRow({ item }: { item: FeedItem }) {
  const subtitle = [item.author.titleSpecialty, item.author.countryRegion].filter(Boolean).join(", ");

  return (
    <li>
      <Link
        href={item.href}
        className="flex w-full flex-col p-4 text-left transition-colors hover:bg-accent/50"
      >
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
          <div className="mt-2 text-base font-semibold">{item.title}</div>
          <div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</div>
          {item.eventStartsAt && (
            <div className="mt-0.5 text-xs text-muted-foreground">Event Date: {formatTimestamp(item.eventStartsAt)}</div>
          )}
          {item.imageUrl && (
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
      </Link>
    </li>
  );
}
