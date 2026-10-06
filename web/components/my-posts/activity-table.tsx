"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getCsrfToken } from "@/lib/csrf-client";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

export type ActivityType = "Blog" | "Library" | "Event" | "Forum" | "Meeting";

export type ActivityRow = {
  id: string;
  type: ActivityType;
  title: string;
  meta?: string;
  status: { label: string; variant: BadgeVariant };
  date: string;
  /** What `date` means ("Last saved", "Published", ...) — shown small above it. Omitted for rows whose date needs no explaining. */
  dateLabel?: string;
  href: string;
  actionLabel: "Edit" | "View";
  /**
   * When set, renders a destructive "Delete" action next to actionLabel
   * that DELETEs this URL and refreshes the page on success. Currently only
   * a Forum row (getMemberForumThreads' canDelete) populates this — the
   * thread's own author, or an event-linked thread's event host.
   */
  deleteHref?: string;
  /** Confirmation copy for deleteHref — required whenever deleteHref is set, since what gets destroyed differs (an event thread's delete also wipes other members' replies; see deleteForumThread's doc comment). */
  deleteConfirmDescription?: string;
};

function DeleteRowButton({ href, confirmDescription }: { href: string; confirmDescription: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(href, { method: "DELETE", headers: { "x-csrf-token": csrfToken } });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!pending ? setOpen(next) : null)}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this thread?</AlertDialogTitle>
          <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            className={buttonVariants({ variant: "destructive" })}
          >
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Cross-domain activity table shared by the All/Blog/Events/Forum tabs
 * (Library keeps its own MySubmissionsTable, reused from /library/mine).
 * `showType` distinguishes the All tab's merged view; `metaHeader` adds an
 * extra column for domain-specific context (e.g. Forum's thread's forum
 * name) without forcing every tab to carry an unused column.
 *
 * `enableDraftFilter` (Save as Draft initiative) adds an All/Drafts chip
 * row, isolating rows whose status.label is "Draft" — passed only by the
 * Events tab today (the one domain here with a draft concept), hidden
 * entirely when the row set has no drafts so it doesn't clutter every
 * other tab.
 */
export function ActivityTable({
  rows,
  showType = false,
  metaHeader,
  emptyMessage,
  enableDraftFilter = false,
}: {
  rows: ActivityRow[];
  showType?: boolean;
  metaHeader?: string;
  emptyMessage: string;
  enableDraftFilter?: boolean;
}) {
  const [draftsOnly, setDraftsOnly] = useState(false);
  const hasDrafts = enableDraftFilter && rows.some((row) => row.status.label === "Draft");
  const visibleRows = draftsOnly && hasDrafts ? rows.filter((row) => row.status.label === "Draft") : rows;

  const colSpan = 4 + (showType ? 1 : 0) + (metaHeader ? 1 : 0);
  return (
    <div className="flex flex-col gap-3">
      {hasDrafts && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={!draftsOnly ? "default" : "outline"} onClick={() => setDraftsOnly(false)}>
            All
          </Button>
          <Button type="button" size="sm" variant={draftsOnly ? "default" : "outline"} onClick={() => setDraftsOnly(true)}>
            Drafts
          </Button>
        </div>
      )}
      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {showType && <TableHead>Type</TableHead>}
              <TableHead>Title</TableHead>
              {metaHeader && <TableHead>{metaHeader}</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  {draftsOnly ? "No drafts." : emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((row) => (
              <TableRow key={`${row.type}-${row.id}`}>
                {showType && <TableCell className="text-muted-foreground">{row.type}</TableCell>}
                <TableCell className="font-medium">{row.title}</TableCell>
                {metaHeader && <TableCell className="text-muted-foreground">{row.meta}</TableCell>}
                <TableCell>
                  <Badge variant={row.status.variant}>{row.status.label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.dateLabel && <div className="text-xs">{row.dateLabel}</div>}
                  {new Date(row.date).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={row.href} className="text-sm text-primary hover:underline">
                      {row.actionLabel}
                    </Link>
                    {row.deleteHref && (
                      <DeleteRowButton href={row.deleteHref} confirmDescription={row.deleteConfirmDescription ?? "This can't be undone."} />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
