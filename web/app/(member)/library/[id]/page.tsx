import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPublishedKnowledgeItemById } from "@/lib/library-server";
import { getDirectoryMemberById } from "@/lib/members-server";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS } from "@/lib/library";
import { KnowledgeContentType, KnowledgeStatus, Role } from "@/lib/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";
import { ResourcePreview } from "@/components/library/resource-preview";
import { LibraryFlagButton } from "@/components/library/library-flag-button";
import { LibraryDiscussionLink } from "@/components/library/library-discussion-link";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await getPublishedKnowledgeItemById(params.id);
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

  const item = await getPublishedKnowledgeItemById(params.id);
  if (!item) notFound();

  const authorProfile = await getDirectoryMemberById(item.contributor.id);
  const canEdit = user.id === item.contributor.id || user.role === Role.moderator || user.role === Role.admin;

  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      <BackLink fallbackHref="/library" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="info" className="w-fit">
          {item.category.name}
        </Badge>
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
      </div>

      <p className="mb-8 text-base leading-relaxed text-muted-foreground">{item.description}</p>

      <ResourcePreview
        title={item.title}
        contentType={item.contentType}
        youtubeUrl={item.youtubeUrl}
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

      <div className="mt-8">
        <LibraryDiscussionLink
          itemId={item.id}
          initialThreadId={item.forumThreadId}
          initialReplyCount={item.forumReplyCount}
        />
      </div>

      {item.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge key={tag.slug} variant="neutral">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
    </main>
  );
}
