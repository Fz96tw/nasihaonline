import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMyPosts } from "@/lib/blog-server";
import { getMySubmissions } from "@/lib/library-server";
import { getEventsHostedByMember } from "@/lib/events-server";
import { getMemberForumThreads } from "@/lib/forums-server";
import { POST_STATUS_LABELS, POST_STATUS_BADGE_VARIANT } from "@/lib/blog";
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from "@/lib/library";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MySubmissionsTable } from "@/components/library/my-submissions-table";
import { MyPostsTabs } from "@/components/my-posts/my-posts-tabs";

export const metadata: Metadata = {
  title: "All My Posts — NASIHA",
};

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

type ActivityType = "Blog" | "Library" | "Event" | "Forum";

type ActivityRow = {
  id: string;
  type: ActivityType;
  title: string;
  meta?: string;
  status: { label: string; variant: BadgeVariant };
  date: string;
  href: string;
  actionLabel: "Edit" | "View";
};

function eventStatus(event: { startsAt: string; cancelledAt: string | null }, now: number): { label: string; variant: BadgeVariant } {
  if (event.cancelledAt) return { label: "Cancelled", variant: "danger" };
  return new Date(event.startsAt).getTime() > now
    ? { label: "Upcoming", variant: "success" }
    : { label: "Past", variant: "neutral" };
}

/**
 * Cross-domain activity table shared by the All/Blog/Events/Forum tabs
 * (Library keeps its own MySubmissionsTable, reused from /library/mine).
 * `showType` distinguishes the All tab's merged view; `metaHeader` adds an
 * extra column for domain-specific context (e.g. Forum's thread's forum
 * name) without forcing every tab to carry an unused column.
 */
function ActivityTable({
  rows,
  showType = false,
  metaHeader,
  emptyMessage,
}: {
  rows: ActivityRow[];
  showType?: boolean;
  metaHeader?: string;
  emptyMessage: string;
}) {
  const colSpan = 4 + (showType ? 1 : 0) + (metaHeader ? 1 : 0);
  return (
    <div className="rounded-[10px] border shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            {showType && <TableHead>Type</TableHead>}
            <TableHead>Title</TableHead>
            {metaHeader && <TableHead>{metaHeader}</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={`${row.type}-${row.id}`}>
              {showType && <TableCell className="text-muted-foreground">{row.type}</TableCell>}
              <TableCell className="font-medium">{row.title}</TableCell>
              {metaHeader && <TableCell className="text-muted-foreground">{row.meta}</TableCell>}
              <TableCell>
                <Badge variant={row.status.variant}>{row.status.label}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{new Date(row.date).toLocaleDateString()}</TableCell>
              <TableCell className="text-right">
                <Link href={row.href} className="text-sm text-primary hover:underline">
                  {row.actionLabel}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * A member's own content across every domain they can create in (§4.5-style
 * aggregation, but self-scoped and all-status instead of the published-only
 * view /members/[memberId] gets of someone else). Reuses getMySubmissions
 * (already all-status) and adds all-status/self-scoped variants of the
 * Blog/Events/Forums queries, which previously only existed in published-only
 * or other-viewer forms.
 */
export default async function MyPostsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [posts, submissions, events, threads] = await Promise.all([
    getMyPosts(user.id),
    getMySubmissions(user.id),
    getEventsHostedByMember(user.id, user.id),
    getMemberForumThreads(user.id, user.id, true),
  ]);

  const now = Date.now();

  const blogRows: ActivityRow[] = posts.map((post) => {
    const status = post.publishedAt ? "published" : "draft";
    return {
      id: post.id,
      type: "Blog",
      title: post.title,
      status: { label: POST_STATUS_LABELS[status], variant: POST_STATUS_BADGE_VARIANT[status] },
      date: post.createdAt,
      href: `/blog/${post.slug}/edit`,
      actionLabel: "Edit",
    };
  });

  const libraryRows: ActivityRow[] = submissions.map((item) => ({
    id: item.id,
    type: "Library",
    title: item.title,
    status: { label: STATUS_LABELS[item.status], variant: STATUS_BADGE_VARIANT[item.status] },
    date: item.createdAt,
    href: `/library/${item.id}/edit`,
    actionLabel: "Edit",
  }));

  const eventRows: ActivityRow[] = events.map((event) => ({
    id: event.id,
    type: "Event",
    title: event.title,
    status: eventStatus(event, now),
    date: event.startsAt,
    href: `/calendar/${event.id}/edit`,
    actionLabel: "Edit",
  }));

  const forumRows: ActivityRow[] = threads.map((thread) => ({
    id: thread.id,
    type: "Forum",
    title: thread.title,
    meta: thread.forumName,
    status: thread.startedByMember ? { label: "Started", variant: "success" } : { label: "Replied", variant: "neutral" },
    date: thread.lastPostAt,
    href: `/forums/${thread.forumSlug}/${thread.id}`,
    actionLabel: "View",
  }));

  const allRows = [...blogRows, ...libraryRows, ...eventRows, ...forumRows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-8">
      <div>
        <Link
          href="/dashboard"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">All My Posts</h1>
        <p className="text-muted-foreground">
          Everything you&apos;ve created — blog posts, Library submissions, hosted events, and forum threads.
        </p>
      </div>

      <MyPostsTabs
        allCount={allRows.length}
        blogCount={blogRows.length}
        libraryCount={libraryRows.length}
        eventsCount={eventRows.length}
        forumCount={forumRows.length}
        allContent={<ActivityTable rows={allRows} showType emptyMessage="You haven't created anything yet." />}
        blogContent={<ActivityTable rows={blogRows} emptyMessage="You haven't written any blog posts yet." />}
        libraryContent={<MySubmissionsTable submissions={submissions} />}
        eventsContent={<ActivityTable rows={eventRows} emptyMessage="You haven't hosted any events yet." />}
        forumContent={
          <ActivityTable
            rows={forumRows}
            metaHeader="Forum"
            emptyMessage="You haven't started or replied to any forum threads yet."
          />
        }
      />
    </main>
  );
}
