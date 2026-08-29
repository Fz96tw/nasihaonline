import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/format-date";
import type { MemberForumThread } from "@/lib/forums";
import { ForumThreadVisibility } from "@/lib/generated/prisma/enums";

/** /members/[memberId]'s Forums tab (§4.5) — the distinct threads this member has posted or replied in, newest activity first. Divided list, same convention as MemberHostedEvents, not one card per thread. */
export function MemberForumThreads({ threads }: { threads: MemberForumThread[] }) {
  if (threads.length === 0) {
    return <p className="text-sm text-muted-foreground">This member hasn&apos;t posted in the forums yet.</p>;
  }
  return (
    <Card className="hover:translate-y-0 hover:shadow-sm">
      <CardContent className="pt-6">
        <ul>
          {threads.map((thread) => (
            <li
              key={thread.id}
              className="flex flex-col gap-2 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link
                href={`/forums/${thread.forumSlug}/${thread.id}`}
                className="flex min-w-0 items-center gap-1.5 truncate font-medium hover:underline"
              >
                {thread.visibility === ForumThreadVisibility.invited && (
                  <Lock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-label="Restricted thread" />
                )}
                <span className="truncate">{thread.title}</span>
              </Link>
              <div className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span>{thread.forumName}</span>
                <span aria-hidden>·</span>
                <span>{formatTimestamp(thread.lastPostAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
