import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/format-date";
import type { MemberForumThread } from "@/lib/forums";

/** /members/[memberId]'s Forums section (§4.5) — the distinct threads this member has posted or replied in, newest activity first. Divided list, same convention as MemberHostedEvents, not one card per thread. */
export function MemberForumThreads({ threads }: { threads: MemberForumThread[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <MessageSquare className="h-4 w-4" />
        Forums
      </h2>
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">This member hasn&apos;t posted in the forums yet.</p>
      ) : (
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
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    {thread.title}
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
      )}
    </section>
  );
}
