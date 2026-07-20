import Link from "next/link";
import { type FeedItem, FEED_TYPE_LABELS } from "@/lib/feed";
import { formatRelativeTime } from "@/lib/format-date";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function FeedRow({ item }: { item: FeedItem }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50"
      >
        <Avatar name={item.author.name ?? "NASIHA Member"} src={item.author.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{item.author.name ?? "NASIHA Member"}</span>
              <Badge variant="neutral" className="flex-shrink-0">
                {FEED_TYPE_LABELS[item.type]}
              </Badge>
            </div>
            <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(item.timestamp)}
            </span>
          </div>
          <div className="mt-0.5 text-sm font-semibold">{item.title}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">{item.excerpt}</div>
          {item.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
            <img
              src={item.imageUrl}
              alt=""
              className="mt-2 max-h-48 w-full rounded-md object-cover"
            />
          )}
        </div>
      </Link>
    </li>
  );
}
