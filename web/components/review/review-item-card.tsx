import Link from "next/link";
import { BookOpen, ClipboardList, FileText, Hand, MessageSquare, PlayCircle, Stethoscope, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { CONTENT_TYPE_LABELS, REVIEW_STATUS_BADGE_VARIANT, REVIEW_STATUS_LABELS } from "@/lib/review";
import type { MyReviewSubmission, SeekingReviewersItem, SharedReviewItem } from "@/lib/review";
import { KnowledgeContentType } from "@/lib/generated/prisma/enums";
// Small client island (offer/withdraw button) inside this otherwise-server card — mirrors LibraryFlagButton's split.
import { ReviewOfferButton } from "@/components/review/review-offer-button";

const CONTENT_TYPE_ICONS: Record<KnowledgeContentType, LucideIcon> = {
  [KnowledgeContentType.recorded_lecture]: PlayCircle,
  [KnowledgeContentType.article]: FileText,
  [KnowledgeContentType.case_study]: Stethoscope,
  [KnowledgeContentType.guideline]: ClipboardList,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function CardShell({
  id,
  contentType,
  title,
  categories,
  hasNewActivity,
  children,
}: {
  id: string;
  contentType: KnowledgeContentType;
  title: string;
  categories: { name: string }[];
  hasNewActivity?: boolean;
  children: React.ReactNode;
}) {
  const Icon = CONTENT_TYPE_ICONS[contentType] ?? BookOpen;

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((category) => (
            <Badge key={category.name} variant="info" className="w-fit">
              {category.name}
            </Badge>
          ))}
        </div>
        <CardTitle className="text-lg">
          <Link href={`/review-feedback/${id}`} className="inline-flex items-center gap-1.5 hover:underline">
            {hasNewActivity && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary" title="New activity">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                New
              </span>
            )}
            {title}
          </Link>
        </CardTitle>
        <div className="flex items-center gap-x-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span>{CONTENT_TYPE_LABELS[contentType]}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

/** "My Submissions" tab card. */
export function MySubmissionCard({ item }: { item: MyReviewSubmission }) {
  return (
    <CardShell id={item.id} contentType={item.contentType} title={item.title} categories={item.categories} hasNewActivity={item.hasNewActivity}>
      {item.pendingOfferCount > 0 && (
        <Badge variant="warning" className="w-fit gap-1">
          <Hand className="h-3 w-3" />
          {item.pendingOfferCount} pending {item.pendingOfferCount === 1 ? "offer" : "offers"} to review
        </Badge>
      )}
      <div className="flex items-center gap-2">
        {item.invitees.slice(0, 4).map((invitee, index) => (
          <Avatar key={index} name={invitee.name ?? "Member"} src={invitee.avatarUrl} size="xs" />
        ))}
        {item.invitees.length > 4 && (
          <span className="text-xs text-muted-foreground">+{item.invitees.length - 4} more</span>
        )}
        {item.invitees.length === 0 && <span className="text-xs text-muted-foreground">No reviewers yet</span>}
      </div>
      <div className="mt-auto flex items-center justify-between pt-1">
        <Badge variant={REVIEW_STATUS_BADGE_VARIANT[item.status]}>{REVIEW_STATUS_LABELS[item.status]}</Badge>
        <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Comments">
          <MessageSquare className="h-3.5 w-3.5" />
          {item.commentCount}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
    </CardShell>
  );
}

/** "Shared With Me" tab card. */
export function SharedReviewCard({ item }: { item: SharedReviewItem }) {
  return (
    <CardShell id={item.id} contentType={item.contentType} title={item.title} categories={item.categories} hasNewActivity={item.hasNewActivity}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Avatar name={item.submitter.name ?? "Member"} src={item.submitter.avatarUrl} size="xs" />
        <span>From {item.submitter.name ?? "a member"}</span>
      </div>
      <div className="mt-auto flex items-center justify-between pt-1">
        <Badge variant={item.needsMyFeedback ? "warning" : "success"}>
          {item.needsMyFeedback ? "Needs your feedback" : "You reviewed this"}
        </Badge>
        <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Comments">
          <MessageSquare className="h-3.5 w-3.5" />
          {item.commentCount}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
    </CardShell>
  );
}

/** "Members Seeking Reviewers" tab card — listing-only, no attachment/comment access until accepted. */
export function SeekingReviewersCard({ item, currentUserId }: { item: SeekingReviewersItem; currentUserId: string }) {
  const isOwn = item.submitter.id === currentUserId;

  return (
    <CardShell id={item.id} contentType={item.contentType} title={item.title} categories={item.categories}>
      <p className="line-clamp-3 text-sm text-muted-foreground">{item.description}</p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Avatar name={item.submitter.name ?? "Member"} src={item.submitter.avatarUrl} size="xs" />
        <span>From {item.submitter.name ?? "a member"}</span>
      </div>
      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Hand className="h-3.5 w-3.5" />
          {item.volunteerCount} {item.volunteerCount === 1 ? "member has" : "members have"} offered
        </span>
        {!isOwn && (
          <ReviewOfferButton itemId={item.id} initialStatus={item.myOfferStatus} />
        )}
      </div>
    </CardShell>
  );
}
