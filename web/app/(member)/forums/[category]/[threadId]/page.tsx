import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock, Pin } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getForumThreadDetail } from "@/lib/forums-server";
import { getMentionableMembers } from "@/lib/members-server";
import { ForumThreadView } from "@/components/forums/forum-thread-view";
import { DeleteForumThreadButton } from "@/components/forums/delete-forum-thread-button";
import { ManageThreadInvitees } from "@/components/forums/manage-thread-invitees";
import { ThreadViewCounter } from "@/components/forums/thread-view-counter";
import { BackLink } from "@/components/back-link";
import { SavedBanner } from "@/components/saved-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { HighlightText } from "@/components/highlight-text";
import { RestrictedAccessNotice } from "@/components/restricted-access-notice";
import { CLINICAL_DISCUSSIONS_SLUG, getForumThreadAudienceBadge } from "@/lib/forums";
import { FEED_TYPE_LABELS } from "@/lib/feed";
import { ForumThreadVisibility, Role } from "@/lib/generated/prisma/enums";

export async function generateMetadata({
  params,
}: {
  params: { category: string; threadId: string };
}): Promise<Metadata> {
  const user = await getSessionUser();
  const isPrivileged = user?.role === Role.moderator || user?.role === Role.admin;
  const thread = user ? await getForumThreadDetail(params.category, params.threadId, user.id, isPrivileged) : null;
  return { title: thread ? `${thread.title} — Forums — NASIHA` : "Thread not found — NASIHA" };
}

/** /forums/[category]/[threadId] (§4.13) — thread detail with threaded replies. */
export default async function ForumThreadPage({
  params,
  searchParams,
}: {
  params: { category: string; threadId: string };
  searchParams: { q?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const q = searchParams.q?.trim() || undefined;

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const thread = await getForumThreadDetail(params.category, params.threadId, user.id, isPrivileged);
  if (!thread) notFound();

  const isRestricted = thread.visibility === ForumThreadVisibility.invited;
  const isAuthor = user.id === thread.authorId;
  const isInvitee = thread.invitees.some((invitee) => invitee.userId === user.id);
  const isPrivilegedOverride = isPrivileged && isRestricted && !isAuthor && !isInvitee;
  const canManageInvitees = isRestricted && (isAuthor || isPrivileged);
  const audienceBadge = getForumThreadAudienceBadge(thread);

  // Member-Initiated Restricted Forum Threads (§4.13/§11.16) — a restricted
  // thread's `@`-mention candidates (both the composer's autocomplete and
  // rendered "@Name" tags) are narrowed to its author + invitees, same
  // rationale as createForumPost's server-side mention narrowing: a
  // resolved mention (or an autocomplete suggestion) for someone who could
  // never actually open the thread would leak its existence.
  const allMentionableMembers = await getMentionableMembers();
  const restrictedMemberIds = isRestricted
    ? [thread.authorId, ...thread.invitees.map((invitee) => invitee.userId)]
    : null;
  const mentionableMembers = restrictedMemberIds
    ? allMentionableMembers.filter((member) => restrictedMemberIds.includes(member.id))
    : allMentionableMembers;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <BackLink fallbackHref={`/forums/${thread.forum.slug}`} />
      <SavedBanner />

      {isPrivilegedOverride && (
        <RestrictedAccessNotice role={user.role} ownerName={thread.authorName ?? "the author"} />
      )}

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{FEED_TYPE_LABELS.forum_thread}</span>
          <span aria-hidden="true">·</span>
          <Link href={`/forums/${thread.forum.slug}`} className="hover:text-foreground hover:underline">
            {thread.forum.name}
          </Link>
        </p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {thread.pinned && <Pin className="h-4 w-4 text-primary" />}
            {isRestricted && <Lock className="h-4 w-4 text-muted-foreground" />}
            <h1 className="text-2xl font-bold tracking-tight">
              <HighlightText text={thread.title} query={q} />
            </h1>
            {isRestricted && <Badge variant={audienceBadge.variant}>{audienceBadge.label}</Badge>}
          </div>
          {thread.isEditable && (isAuthor || isPrivileged) && (
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/forums/${thread.forum.slug}/${thread.id}/edit`}>Edit</Link>
              </Button>
              <DeleteForumThreadButton threadId={thread.id} forumSlug={thread.forum.slug} title={thread.title} />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Started by {thread.authorName ?? "A member"} in{" "}
            <Link href={`/forums/${thread.forum.slug}`} className="font-medium text-foreground hover:underline">
              {thread.forum.name}
            </Link>
          </p>
          <ThreadViewCounter threadId={thread.id} initialViews={thread.viewCount} commentCount={thread.replyCount} />
        </div>
      </div>

      <ForumThreadView
        threadId={thread.id}
        posts={thread.posts}
        requireDeidentification={thread.forum.slug === CLINICAL_DISCUSSIONS_SLUG}
        mentionableMembers={mentionableMembers}
        allowedMemberIds={restrictedMemberIds ?? undefined}
        currentUserId={user.id}
        isPrivileged={isPrivileged}
        highlightQuery={q}
      />

      {isRestricted &&
        (canManageInvitees ? (
          <ManageThreadInvitees threadId={thread.id} initialRoster={thread.invitees} />
        ) : (
          <div className="flex flex-col gap-2 border-t pt-6">
            <h2 className="text-sm font-semibold">Invited members ({thread.invitees.length})</h2>
            <ul className="flex flex-col divide-y">
              {thread.invitees.map((member) => (
                <li key={member.userId} className="flex items-center gap-2 py-2">
                  <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" />
                  <span className="text-sm">{member.name ?? "A member"}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </main>
  );
}
