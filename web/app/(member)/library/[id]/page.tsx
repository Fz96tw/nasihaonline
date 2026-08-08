import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getKnowledgeItemRoster, getPublishedKnowledgeItemById } from "@/lib/library-server";
import { getDirectoryMemberById, getMentionableMembers } from "@/lib/members-server";
import { getForumThreadDetail } from "@/lib/forums-server";
import { LIBRARY_FORUM_SLUG } from "@/lib/forums";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS } from "@/lib/library";
import { youtubeThumbnailUrl } from "@/lib/youtube";
import { KnowledgeContentType, KnowledgeStatus, KnowledgeVisibility, Role } from "@/lib/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";
import { ResourcePreview } from "@/components/library/resource-preview";
import { LibraryFlagButton } from "@/components/library/library-flag-button";
import { LibraryDiscussionLink } from "@/components/library/library-discussion-link";
import { LibraryViewCounter } from "@/components/library/library-view-counter";
import { ManageLibraryInvitees } from "@/components/library/manage-invitees";
import { ForumThreadView } from "@/components/forums/forum-thread-view";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const user = await getSessionUser();
  const isPrivileged = user?.role === Role.moderator || user?.role === Role.admin;
  const item = user ? await getPublishedKnowledgeItemById(params.id, user.id, isPrivileged) : null;
  return { title: item ? `${item.title} — Knowledge Library — NASIHA` : "Resource not found — NASIHA" };
}

/**
 * /library/[id] (§4.9) — member-only detail page, replacing the browse
 * grid's old preview modal. Published/flagged only — pending_review and
 * rejected items 404 here, even for their own contributor (they use
 * /library/[id]/edit to see those). Mirrors /blog/[slug]'s depth (author
 * byline, badges, edit/flag actions) but swaps Blog's native comments for
 * an on-demand link into the Library Discussions forum, since KnowledgeItem
 * has no body/comment model of its own.
 */
export default async function LibraryItemDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const item = await getPublishedKnowledgeItemById(params.id, user.id, isPrivileged);
  if (!item) notFound();

  const authorProfile = await getDirectoryMemberById(item.contributor.id);
  const canEdit = user.id === item.contributor.id || isPrivileged;
  const isRestricted = item.visibility === KnowledgeVisibility.restricted;
  const roster = isRestricted ? await getKnowledgeItemRoster(item.id) : null;

  const thread = item.forumThreadId
    ? await getForumThreadDetail(LIBRARY_FORUM_SLUG, item.forumThreadId, user.id, isPrivileged)
    : null;
  const mentionableMembers = thread ? await getMentionableMembers() : [];

  // A custom hero image always wins; a recorded_lecture with none set falls
  // back to its video's YouTube thumbnail as the default cover — same
  // precedence as LibraryItemCard's browse-grid thumbnail.
  const heroImageUrl = item.heroImageUrl ?? (item.youtubeUrl ? youtubeThumbnailUrl(item.youtubeUrl) : null);

  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      <BackLink fallbackHref="/library" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline" />

      {heroImageUrl && (
        <div className="mb-6 flex h-72 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied or external YouTube URL, not a next/image-eligible local asset */}
          <img src={heroImageUrl} alt={item.title} className="h-full w-full object-contain" />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {item.categories.map((category) => (
          <Badge key={category.slug} variant="info" className="w-fit">
            {category.name}
          </Badge>
        ))}
        <Badge variant="neutral">{CONTENT_TYPE_LABELS[item.contentType]}</Badge>
        <Badge variant="neutral">{LEVEL_LABELS[item.level]}</Badge>
        {item.status === KnowledgeStatus.flagged && <Badge variant="danger">Flagged</Badge>}
        {item.contentType === KnowledgeContentType.case_study && item.deidentificationConfirmed && (
          <Badge variant="info">De-identification confirmed</Badge>
        )}
      </div>

      <h1 className="mb-3 text-4xl font-extrabold tracking-tight">{item.title}</h1>

      <div className="mb-8 flex items-center justify-between gap-3">
        {authorProfile ? (
          <Link
            href={`/members/${authorProfile.id}`}
            aria-label={`View ${item.contributor.name ?? "this member"}'s profile`}
            className="flex items-center gap-3 text-left"
          >
            <Avatar name={item.contributor.name ?? "Member"} src={authorProfile.avatarUrl} size="sm" />
            <div className="text-sm text-muted-foreground">
              <div className="font-medium text-foreground">{item.contributor.name ?? "Member"}</div>
              <div>{formatDate(item.createdAt)}</div>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name={item.contributor.name ?? "Member"} size="sm" />
            <div className="text-sm text-muted-foreground">
              <div className="font-medium text-foreground">{item.contributor.name ?? "A member"}</div>
              <div>{formatDate(item.createdAt)}</div>
            </div>
          </div>
        )}
        <LibraryViewCounter itemId={item.id} initialViews={item.viewCount} />
      </div>

      <p className="mb-8 text-base leading-relaxed text-muted-foreground">{item.description}</p>

      <ResourcePreview
        title={item.title}
        contentType={item.contentType}
        youtubeUrl={item.youtubeUrl}
        externalUrl={item.externalUrl}
        attachment={item.attachment}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/library/${item.id}/edit`}>Edit Resource</Link>
          </Button>
        )}
        {item.status === KnowledgeStatus.published && <LibraryFlagButton itemId={item.id} initialFlagged={false} />}
      </div>

      {roster ? (
        canEdit ? (
          <div className="mt-8">
            <ManageLibraryInvitees itemId={item.id} initialRoster={roster} />
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-2 border-t pt-6">
            <h2 className="text-sm font-semibold">Invited members ({roster.length})</h2>
            <ul className="flex flex-col divide-y">
              {roster.map((member) => (
                <li key={member.userId} className="flex items-center gap-2 py-2">
                  <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" />
                  <span className="text-sm">{member.name ?? "A member"}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {!item.forumThreadId && (
        <div className="mt-8">
          <LibraryDiscussionLink itemId={item.id} initialThreadId={item.forumThreadId} />
        </div>
      )}

      {item.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge key={tag.slug} variant="neutral">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {thread && (
        <div className="mt-10 border-t pt-8">
          <h2 className="mb-4 text-lg font-semibold">Discussion</h2>
          <ForumThreadView
            threadId={thread.id}
            // Drop the auto-authored opening post (always posts[0] — created
            // atomically with the thread in startKnowledgeItemDiscussion)
            // linking back to this resource: redundant here since we're
            // already on the resource page. The standalone
            // /forums/[category]/[threadId] view keeps it.
            posts={thread.posts.slice(1)}
            requireDeidentification={false}
            mentionableMembers={mentionableMembers}
            currentUserId={user.id}
            isPrivileged={isPrivileged}
          />
        </div>
      )}
    </main>
  );
}
