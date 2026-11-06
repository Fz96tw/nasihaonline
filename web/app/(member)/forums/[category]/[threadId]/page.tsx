import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { ReflectionHero } from "@/components/reflection/reflection-hero";
import { CLINICAL_DISCUSSIONS_SLUG, flattenForumPostBodies, getForumThreadAudienceBadge } from "@/lib/forums";
import { mentionCandidatesUsedIn } from "@/lib/mentions";
import { FEED_TYPE_LABELS } from "@/lib/feed";
import { ForumThreadVisibility, Role } from "@/lib/generated/prisma/enums";

export async function generateMetadata({
  params,
}: {
  params: { category: string; threadId: string };
}): Promise<Metadata> {
  const user = await getSessionUser();
  const isPrivileged = user?.role === Role.moderator || user?.role === Role.admin;
  // Signed-out (undefined viewer) gets the public-only gate, so a crawler
  // sees real metadata for exactly the threads it can read.
  const thread = await getForumThreadDetail(params.category, params.threadId, user?.id, isPrivileged);
  if (!thread) return { title: "Thread not found", robots: { index: false } };
  const opening = thread.posts[0]?.removed ? "" : (thread.posts[0]?.body ?? "");
  const description = metaDescription(opening || `A discussion in the NASIHA ${thread.forum.name} forum.`);
  const path = `/forums/${thread.forum.slug}/${thread.id}`;
  return {
    title: `${thread.title} — ${thread.forum.name} Forum`,
    description,
    alternates: { canonical: path },
    openGraph: { type: "article", url: path, title: thread.title, description },
    // A restricted thread renders for its invitees, but must never be indexed.
    ...(thread.visibility === ForumThreadVisibility.invited || thread.forum.slug === CLINICAL_DISCUSSIONS_SLUG
      ? { robots: { index: false } }
      : {}),
  };
}

const META_DESCRIPTION_MAX = 160;

function metaDescription(text: string): string {
  // Strip pasted-image/video markdown tokens and URLs before collapsing whitespace.
  const flat = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > META_DESCRIPTION_MAX ? `${flat.slice(0, META_DESCRIPTION_MAX - 1).trimEnd()}…` : flat;
}

/**
 * /forums/[category]/[threadId] (§4.13) — thread detail with threaded
 * replies. Public, read-only, for a signed-out reader when the thread
 * passes PUBLIC_FORUM_THREAD_WHERE (SEO objective 789ae42a — never Clinical
 * Discussions or a restricted thread); 404 otherwise.
 */
export default async function ForumThreadPage({
  params,
  searchParams,
}: {
  params: { category: string; threadId: string };
  searchParams: { q?: string };
}) {
  const user = await getSessionUser();
  const q = searchParams.q?.trim() || undefined;

  const isPrivileged = user?.role === Role.moderator || user?.role === Role.admin;
  const thread = await getForumThreadDetail(params.category, params.threadId, user?.id, isPrivileged);
  if (!thread) notFound();

  const isRestricted = thread.visibility === ForumThreadVisibility.invited;
  const isAuthor = !!user && user.id === thread.authorId;
  const isInvitee = !!user && thread.invitees.some((invitee) => invitee.userId === user.id);
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
  // Also covers an invite-only event's discussion thread (host + invitees).
  const restrictedMemberIds = thread.mentionAllowedIds;
  const mentionableMembers = restrictedMemberIds
    ? allMentionableMembers.filter((member) => restrictedMemberIds.includes(member.id))
    : user
      ? allMentionableMembers
      : // A signed-out page only ships the members actually tagged in the thread.
        mentionCandidatesUsedIn(flattenForumPostBodies(thread.posts), allMentionableMembers);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <BackLink fallbackHref={user ? `/forums/${thread.forum.slug}` : "/"} />
      <SavedBanner />

      {isPrivilegedOverride && user && (
        <RestrictedAccessNotice role={user.role} ownerName={thread.authorName ?? "the author"} />
      )}

      {thread.reflection && <ReflectionHero reflection={thread.reflection} />}

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{FEED_TYPE_LABELS.forum_thread}</span>
          <span aria-hidden="true">·</span>
          {user ? (
            <Link href={`/forums/${thread.forum.slug}`} className="hover:text-foreground hover:underline">
              {thread.forum.name}
            </Link>
          ) : (
            <span>{thread.forum.name}</span>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {thread.pinned && <Pin className="h-4 w-4 text-primary" />}
            {isRestricted && <Lock className="h-4 w-4 text-muted-foreground" />}
            {/* The hero banner already shows the quote, so a reflection thread's title stays for screen readers/SEO but is not repeated visually. */}
            <h1 className={thread.reflection ? "sr-only" : "text-2xl font-bold tracking-tight"}>
              <HighlightText text={thread.title} query={q} />
            </h1>
            {isRestricted && <Badge variant={audienceBadge.variant}>{audienceBadge.label}</Badge>}
          </div>
          {thread.canParticipate && thread.isEditable && (isAuthor || isPrivileged) && (
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
            {user ? (
              <Link href={`/forums/${thread.forum.slug}`} className="font-medium text-foreground hover:underline">
                {thread.forum.name}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{thread.forum.name}</span>
            )}
          </p>
          <ThreadViewCounter
            threadId={thread.id}
            initialViews={thread.viewCount}
            commentCount={thread.replyCount}
            record={thread.canParticipate}
          />
        </div>
      </div>

      <ForumThreadView
        threadId={thread.id}
        posts={thread.posts}
        requireDeidentification={thread.forum.slug === CLINICAL_DISCUSSIONS_SLUG}
        mentionableMembers={mentionableMembers}
        allowedMemberIds={restrictedMemberIds ?? undefined}
        currentUserId={user?.id ?? null}
        canParticipate={thread.canParticipate}
        communityName={thread.communityName}
        isPrivileged={isPrivileged}
        highlightQuery={q}
      />

      {isRestricted &&
        user &&
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
