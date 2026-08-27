import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shield, UserCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import {
  getReviewItemDetail,
  getReviewComments,
  getReviewItemRoster,
  getPendingVolunteerOffers,
} from "@/lib/review-server";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS } from "@/lib/review";
import { FEED_TYPE_LABELS } from "@/lib/feed";
import { KnowledgeContentType, Role } from "@/lib/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";
import { ResourcePreview } from "@/components/library/resource-preview";
import { ManageReviewInvitees } from "@/components/review/manage-review-invitees";
import { ReviewAudienceToggle } from "@/components/review/review-audience-toggle";
import { ReviewCommentThread } from "@/components/review/review-comment-thread";
import { VolunteerOffersPanel } from "@/components/review/volunteer-offers-panel";
import { ReviewLifecycleActions } from "@/components/review/review-lifecycle-actions";
import { ReviewOfferButton } from "@/components/review/review-offer-button";
import { SavedBanner } from "@/components/saved-banner";
import { HighlightText } from "@/components/highlight-text";

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
 * /review-feedback/[id] — detail page. getReviewItemDetail returns null (and
 * this 404s, not 403s, so a guessed id can't even confirm the item's
 * existence — same convention as the Library/Forums restricted-content
 * gates) for anyone who can't see even the preview tier: not the submitter,
 * an invitee, a moderator/admin, or — for an open call — any other member.
 * That last case (item.hasFullAccess: false) renders a reduced preview with
 * an Offer-to-Review CTA instead of the full submission/comment thread,
 * since the material and discussion stay gated behind an accepted offer.
 */
export default async function ReviewItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: { q?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const item = await getReviewItemDetail(id, user);
  if (!item) notFound();
  const q = searchParams.q?.trim() || undefined;

  if (!item.hasFullAccess) {
    return (
      <main className="mx-auto max-w-3xl px-8 py-16">
        <BackLink fallbackHref="/review-feedback" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline" />

        {item.myOfferStatus === "pending" && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
            <UserCheck className="h-4 w-4 shrink-0" />
            <span>
              You offered to review this submission — waiting for {item.submitter.name ?? "the submitter"} to respond.
            </span>
          </div>
        )}

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FEED_TYPE_LABELS.peer_review}</p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {item.categories.map((category) => (
            <Badge key={category.slug} variant="info" className="w-fit">
              {category.name}
            </Badge>
          ))}
          <Badge variant="neutral">{CONTENT_TYPE_LABELS[item.contentType]}</Badge>
          <Badge variant="neutral">{LEVEL_LABELS[item.level]}</Badge>
        </div>

        <h1 className="mb-3 text-4xl font-extrabold tracking-tight">
          <HighlightText text={item.title} query={q} />
        </h1>

        <div className="mb-8 flex items-center gap-3">
          <Avatar name={item.submitter.name ?? "Member"} src={item.submitter.avatarUrl} size="sm" />
          <div className="text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{item.submitter.name ?? "A member"}</div>
            <div>{formatDate(item.createdAt)}</div>
          </div>
        </div>

        <p className="mb-8 text-base leading-relaxed text-muted-foreground">
          <HighlightText text={item.description} query={q} />
        </p>

        <div className="rounded-lg border bg-accent/30 p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            {item.submitter.name ?? "This member"} is looking for volunteer reviewers for this submission. Offer to
            review to get full access to the material and discussion once they accept.
          </p>
          {item.volunteerNote && (
            <p className="mb-4 text-sm italic text-muted-foreground">
              Looking for: <HighlightText text={item.volunteerNote} query={q} />
            </p>
          )}
          <ReviewOfferButton itemId={item.id} initialStatus={item.myOfferStatus} />
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

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;
  const isPrivilegedOverride = isPrivileged && !item.isSubmitter && !item.isInvitee;
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
      <SavedBanner />

      {isPrivilegedOverride && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
          <Shield className="h-4 w-4 shrink-0" />
          <span>
            You&apos;re viewing this as a {user.role} — {item.submitter.name ?? "the submitter"} hasn&apos;t granted
            you access directly.
          </span>
        </div>
      )}

      {!item.isSubmitter && item.isInvitee && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
          <UserCheck className="h-4 w-4 shrink-0" />
          <span>
            {item.myOfferStatus === "accepted"
              ? "Your offer to review this submission was accepted."
              : `${item.submitter.name ?? "The submitter"} asked you to review this submission.`}
          </span>
        </div>
      )}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FEED_TYPE_LABELS.peer_review}</p>

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

      <h1 className="mb-3 text-4xl font-extrabold tracking-tight">
        <HighlightText text={item.title} query={q} />
      </h1>

      <div className="mb-8 flex items-center gap-3">
        <Avatar name={item.submitter.name ?? "Member"} src={item.submitter.avatarUrl} size="sm" />
        <div className="text-sm text-muted-foreground">
          <div className="font-medium text-foreground">{item.submitter.name ?? "A member"}</div>
          <div>{formatDate(item.createdAt)}</div>
        </div>
      </div>

      <p className={item.volunteerNote ? "mb-2 text-base leading-relaxed text-muted-foreground" : "mb-8 text-base leading-relaxed text-muted-foreground"}>
        <HighlightText text={item.description} query={q} />
      </p>

      {item.volunteerNote && (
        <p className="mb-8 text-sm italic text-muted-foreground">
          Looking for: <HighlightText text={item.volunteerNote} query={q} />
        </p>
      )}

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

      {item.isSubmitter && (
        <ReviewLifecycleActions
          itemId={item.id}
          status={item.status}
          publishedKnowledgeItemId={item.publishedKnowledgeItemId}
          publishedKnowledgeItemStatus={item.publishedKnowledgeItemStatus}
        />
      )}

      {item.isSubmitter ? (
        <div className="mt-8 flex flex-col gap-6">
          <ReviewAudienceToggle itemId={item.id} initialSeekingReviewers={item.seekingReviewers} inviteeCount={roster.length} />
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
          highlightQuery={q}
        />
      </div>
    </main>
  );
}
