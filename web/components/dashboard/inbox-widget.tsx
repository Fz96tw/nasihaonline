import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUnreadInboxSummaryForUser } from "@/lib/inbox-server";

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.max(Math.round(diffMs / 60000), 1);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

/** Surfaces unread inbox messages on the dashboard (ui-system.md's "unread messages" pattern). */
export async function InboxWidget({ userId }: { userId: string }) {
  const { unreadCount, items } = await getUnreadInboxSummaryForUser(userId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Inbox</CardTitle>
        {unreadCount > 0 ? <Badge variant="warning">{unreadCount} unread</Badge> : null}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;re all caught up — no unread messages.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((message) => (
              <li key={message.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                <Link
                  href={`/inbox?item=${message.id}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {message.senderName}
                  {message.subject ? ` — ${message.subject}` : ""}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {message.snippet} · {formatRelativeTime(message.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link href="/inbox" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Open Inbox
        </Link>
      </CardContent>
    </Card>
  );
}
