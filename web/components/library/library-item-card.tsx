"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, ClipboardList, FileText, Flag, PlayCircle, Stethoscope, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS, type LibraryCard as LibraryCardData } from "@/lib/library";
import { KnowledgeContentType, KnowledgeStatus } from "@/lib/generated/prisma/enums";
import { getCsrfToken } from "@/lib/csrf-client";
import { ResourcePreviewDialog } from "@/components/library/resource-preview-dialog";
import { FlagContentDialog } from "@/components/flag-content-dialog";

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
 * no other route to the viewer's identity/role.
 */
export function LibraryItemCard({ item, canEdit }: { item: LibraryCardData; canEdit: boolean }) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const Icon = CONTENT_TYPE_ICONS[item.contentType] ?? BookOpen;

  async function handleFlag(reason: string) {
    setFlagging(true);
    setFlagError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/library/${item.id}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setFlagDialogOpen(false);
      router.refresh();
    } catch (err) {
      setFlagError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setFlagging(false);
    }
  }

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="info" className="w-fit">
              {item.category.name}
            </Badge>
            {item.status === KnowledgeStatus.flagged && <Badge variant="danger">Flagged</Badge>}
          </div>
          <CardTitle className="text-lg">
            <button type="button" onClick={() => setPreviewOpen(true)} className="text-left hover:underline">
              {item.title}
            </button>
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
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/library/${item.id}/edit`}>Edit</Link>
                </Button>
              )}
              {item.status === KnowledgeStatus.published && (
                <Button size="sm" variant="ghost" onClick={() => setFlagDialogOpen(true)} title="Flag as inaccurate or outdated">
                  <Flag className="mr-1.5 h-3.5 w-3.5" />
                  Flag
                </Button>
              )}
            </div>
          </div>
          {flagError && <p className="text-xs text-destructive">{flagError}</p>}
        </CardContent>
      </Card>

      <ResourcePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={item.title}
        contentType={item.contentType}
        youtubeUrl={item.youtubeUrl}
        attachment={item.attachment}
      />

      <FlagContentDialog
        open={flagDialogOpen}
        onOpenChange={setFlagDialogOpen}
        itemLabel="resource"
        submitting={flagging}
        error={flagError}
        onConfirm={handleFlag}
      />
    </>
  );
}
