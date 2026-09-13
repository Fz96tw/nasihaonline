import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMySubmissions } from "@/lib/library-server";
import { getEventsHostedByMember } from "@/lib/events-server";
import { getMemberForumThreads } from "@/lib/forums-server";
import { getMyMeetingRequests } from "@/lib/meeting-requests-server";
import { KnowledgeContentType } from "@/lib/generated/prisma/enums";
import { STATUS_LABELS, STATUS_BADGE_VARIANT } from "@/lib/library";
import { MEETING_REQUEST_STATUS_LABELS, MEETING_REQUEST_STATUS_BADGE_VARIANT } from "@/lib/meeting-requests";
import { MySubmissionsTable } from "@/components/library/my-submissions-table";
import { MyPostsTabs } from "@/components/my-posts/my-posts-tabs";
import { ActivityTable, type ActivityRow, type BadgeVariant } from "@/components/my-posts/activity-table";

export const metadata: Metadata = {
  title: "All My Activity",
};

function eventStatus(
  event: { startsAt: string; cancelledAt: string | null; publishedAt: string | null },
  now: number,
): { label: string; variant: BadgeVariant } {
  // Save as Draft initiative — checked first: a draft has no meaningful
  // Upcoming/Past/Cancelled state yet.
  if (event.publishedAt === null) return { label: "Draft", variant: "neutral" };
  if (event.cancelledAt) return { label: "Cancelled", variant: "danger" };
  return new Date(event.startsAt).getTime() > now
    ? { label: "Upcoming", variant: "success" }
    : { label: "Past", variant: "neutral" };
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

  const [submissions, events, threads, meetings] = await Promise.all([
    getMySubmissions(user.id),
    getEventsHostedByMember(user.id, user.id),
    getMemberForumThreads(user.id, user.id, true),
    getMyMeetingRequests(user.id),
  ]);

  const now = Date.now();

  // Blog was consolidated into the Library as the blog_post content type —
  // both tabs read from the same getMySubmissions query, split by
  // contentType, so a member's own blog posts still show up under a
  // separate "Blog Posts" tab (matching how they likely still think of
  // "things I wrote" vs. "things I curated") without ever double-counting
  // an item in both the Blog and Library tabs/rows.
  const blogSubmissions = submissions.filter((item) => item.contentType === KnowledgeContentType.blog_post);
  const libraryOnlySubmissions = submissions.filter((item) => item.contentType !== KnowledgeContentType.blog_post);

  const libraryRows: ActivityRow[] = submissions.map((item) => ({
    id: item.id,
    type: item.contentType === KnowledgeContentType.blog_post ? "Blog" : "Library",
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
    date: event.createdAt,
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

  const meetingRows: ActivityRow[] = meetings.map((meeting) => ({
    id: meeting.id,
    type: "Meeting",
    title: meeting.topic,
    meta: meeting.otherPartyName,
    status: { label: MEETING_REQUEST_STATUS_LABELS[meeting.status], variant: MEETING_REQUEST_STATUS_BADGE_VARIANT[meeting.status] },
    date: meeting.createdAt,
    href: `/inbox?item=${meeting.id}`,
    actionLabel: "View",
  }));

  const allRows = [...libraryRows, ...eventRows, ...forumRows, ...meetingRows].sort(
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
        <h1 className="text-3xl font-bold tracking-tight">All My Activity</h1>
        <p className="text-muted-foreground">
          Everything you&apos;ve created — blog posts, Library submissions, hosted events, forum threads, and 1-1
          meetings.
        </p>
      </div>

      <MyPostsTabs
        allCount={allRows.length}
        blogCount={blogSubmissions.length}
        libraryCount={libraryOnlySubmissions.length}
        eventsCount={eventRows.length}
        forumCount={forumRows.length}
        meetingsCount={meetingRows.length}
        allContent={<ActivityTable rows={allRows} showType emptyMessage="You haven't created anything yet." />}
        blogContent={<MySubmissionsTable submissions={blogSubmissions} />}
        libraryContent={<MySubmissionsTable submissions={libraryOnlySubmissions} />}
        eventsContent={
          <ActivityTable rows={eventRows} emptyMessage="You haven't hosted any events yet." enableDraftFilter />
        }
        forumContent={
          <ActivityTable
            rows={forumRows}
            metaHeader="Forum"
            emptyMessage="You haven't started or replied to any forum threads yet."
          />
        }
        meetingsContent={
          <ActivityTable
            rows={meetingRows}
            metaHeader="With"
            emptyMessage="You haven't sent or received any meeting requests yet."
          />
        }
      />
    </main>
  );
}
