import Link from "next/link";
import { BookOpen, ClipboardList, Eye, FileText, MessageSquare, PlayCircle, Stethoscope, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS, type LibraryCard as LibraryCardData } from "@/lib/library";
import { KnowledgeContentType, KnowledgeStatus } from "@/lib/generated/prisma/enums";
import { LibraryFlagButton } from "@/components/library/library-flag-button";

const CONTENT_TYPE_ICONS: Record<KnowledgeContentType, LucideIcon> = {
  [KnowledgeContentType.recorded_lecture]: PlayCircle,
  [KnowledgeContentType.article]: FileText,
  [KnowledgeContentType.case_study]: Stethoscope,
  [KnowledgeContentType.guideline]: ClipboardList,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * `canEdit` is computed server-side by the page (contributor, Steward, or
 * admin — same gate updateKnowledgeItem enforces again) since this card has
 * no other route to the viewer's identity/role. Title/Preview link through
 * to /library/[id] (§4.9) rather than opening a preview modal — the full
 * preview, discussion link, etc. all live on that detail page now.
 */
export function LibraryItemCard({ item, canEdit }: { item: LibraryCardData; canEdit: boolean }) {
  const Icon = CONTENT_TYPE_ICONS[item.contentType] ?? BookOpen;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="info" className="w-fit">
            {item.category.name}
          </Badge>
          {item.status === KnowledgeStatus.flagged && <Badge variant="danger">Flagged</Badge>}
        </div>
        <CardTitle className="text-lg">
          <Link href={`/library/${item.id}`} className="hover:underline">
            {item.title}
          </Link>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Icon className="h-4 w-4 flex-shrink-0" />
          <span>{CONTENT_TYPE_LABELS[item.contentType]}</span>
          <span aria-hidden>·</span>
          <span>{LEVEL_LABELS[item.level]}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{item.description}</p>
        <p className="text-xs text-muted-foreground">
          {item.contributor.name ?? "A member"} · {formatDate(item.createdAt)}
        </p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/library/${item.id}`}>Preview</Link>
          </Button>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/library/${item.id}/edit`}>Edit</Link>
              </Button>
            )}
            {item.status === KnowledgeStatus.published && <LibraryFlagButton itemId={item.id} initialFlagged={false} />}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1" title="Unique visitors">
            <Eye className="h-3.5 w-3.5" />
            {item.viewCount}
          </span>
          <span className="flex items-center gap-1" title="Comments">
            <MessageSquare className="h-3.5 w-3.5" />
            {item.commentCount}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
