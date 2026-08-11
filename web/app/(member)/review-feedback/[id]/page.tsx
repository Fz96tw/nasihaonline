import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getReviewItemDetail,
  getReviewComments,
  getReviewItemRoster,
  getPendingVolunteerOffers,
} from "@/lib/review-server";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS } from "@/lib/review";
import { KnowledgeContentType, Role } from "@/lib/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";
import { ResourcePreview } from "@/components/library/resource-preview";
import { ManageReviewInvitees } from "@/components/review/manage-review-invitees";
import { ReviewCommentThread } from "@/components/review/review-comment-thread";
import { VolunteerOffersPanel } from "@/components/review/volunteer-offers-panel";
import { ReviewLifecycleActions } from "@/components/review/review-lifecycle-actions";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const user = await getSessionUser();
  const item = user ? await getReviewItemDetail(id, user) : null;
  return { title: item ? `${item.title} — Peer Review & Feedback — NASIHA` : "Item not found — NASIHA" };
}

/**
 * /review-feedback/[id] — invite-only detail page. This is the enforcement
 * point for the feature's core privacy guarantee: getReviewItemDetail
 * returns null for anyone who isn't the submitter, an invitee, or a
 * moderator/admin, and that null is treated identically to "doesn't exist"
 * (notFound(), not a 403) so a guessed id can't even confirm the item's
 * existence — same convention as the Library/Forums restricted-content gates.
 */
export default async function ReviewItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const item = await getReviewItemDetail(id, user);
  if (!item) notFound();

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const roster = await getReviewItemRoster(id);
  const comments = await getReviewComments(id);
  const pendingOffers = item.isSubmitter && item.seekingReviewers ? await getPendingVolunteerOffers(id) : [];

  const mentionCandidates = [
    { id: item.submitter.id, name: item.submitter.name ?? "A member" },
    ...roster.map((member) => ({ id: member.userId, name: member.name ?? "A member" })),
  ];
  const allowedMemberIds = mentionCandidates.map((member) => member.id);

  return (
    <main className="mx-auto max-w-3xl px-8 py-16">
      <BackLink fallbackHref="/review-feedback" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {item.categories.map((category) => (
          <Badge key={category.slug} variant="info" className="w-fit">
            {category.name}
          </Badge>
        ))}
        <Badge variant="neutral">{CONTENT_TYPE_LABELS[item.contentType]}</Badge>
        <Badge variant="neutral">{LEVEL_LABELS[item.level]}</Badge>
        <Badge variant={item.status === "open" ? "info" : "neutral"}>{item.status === "open" ? "Open" : "Closed"}</Badge>
        {item.contentType === KnowledgeContentType.case_study && item.deidentificationConfirmed && (
          <Badge variant="info">De-identification confirmed</Badge>
        )}
      </div>

      <h1 className="mb-3 text-4xl font-extrabold tracking-tight">{item.title}</h1>

      <div className="mb-8 flex items-center gap-3">
        <Avatar name={item.submitter.name ?? "Member"} size="sm" />
        <div className="text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{item.submitter.name ?? "A member"}</div>
          <div>{formatDate(item.createdAt)}</div>
        </div>
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
        {item.isSubmitter && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/review-feedback/${item.id}/edit`}>Edit Item</Link>
          </Button>
        )}
      </div>

      {item.isSubmitter && <ReviewLifecycleActions itemId={item.id} status={item.status} publishedKnowledgeItemId={item.publishedKnowledgeItemId} />}

      {item.isSubmitter ? (
        <div className="mt-8">
          <ManageReviewInvitees itemId={item.id} initialRoster={roster} />
        </div>
      ) : (
        roster.length > 0 && (
          <div className="mt-8 flex flex-col gap-2 border-t pt-6">
            <h2 className="text-sm font-semibold">Reviewers ({roster.length})</h2>
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
      )}

      {item.isSubmitter && item.seekingReviewers && <VolunteerOffersPanel itemId={item.id} initialOffers={pendingOffers} />}

      {item.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge key={tag.slug} variant="neutral">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-10 border-t pt-8">
        <h2 className="mb-4 text-lg font-semibold">Feedback</h2>
        <ReviewCommentThread
          itemId={item.id}
          comments={comments}
          mentionableMembers={mentionCandidates}
          allowedMemberIds={allowedMemberIds}
          currentUserId={user.id}
          isPrivileged={isPrivileged}
        />
      </div>
    </main>
  );
}
