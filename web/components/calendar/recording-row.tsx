"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * One row in a "Recording" list — shared by the Event detail page (LiveKit
 * segments and the legacy single Meet recordingUrl) and the 1:1
 * MeetingRequest detail pane's equivalent. Watch is the one directly
 * visible action; download/copy/delete live behind a single overflow menu,
 * so at most two elements (the title group and the menu button) ever sit
 * in the row — the title/metadata group wraps internally onto its own
 * second line at narrow widths instead of spilling icon buttons.
 *
 * `copyUrl` is copied verbatim — pass something durable/absolute (a Meet
 * recording's own Drive link, or this app's own /recording/:id redirect
 * route rather than the short-lived presigned MinIO URL it resolves to),
 * since the point is a link a member can paste into a forum post,
 * announcement, or library item and have it still work later.
 */
export function RecordingRow({
  label,
  meta,
  status,
  watchHref,
  downloadHref,
  copyUrl,
  copyLabel,
  deleteUrl,
  onDeleted,
}: {
  label: string;
  /** Pre-formatted "42 min · Aug 20, 3:00 PM", or null before hydration / when unknown. */
  meta: string | null;
  status: "ready" | "processing" | "failed";
  watchHref: string | null;
  downloadHref: string | null;
  copyUrl: string | null;
  copyLabel: string;
  /** Omit (null) to hide the Delete action — organizer-only. */
  deleteUrl: string | null;
  onDeleted: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleCopy() {
    if (!copyUrl) return;
    try {
      await navigator.clipboard.writeText(copyUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
  }

  async function handleDelete() {
    if (!deleteUrl) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setConfirmOpen(false);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDeletePending(false);
    }
  }

  const hasMenu = Boolean(downloadHref || copyUrl || deleteUrl);

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="flex items-center gap-2">
          {status === "ready" && watchHref ? (
            <Link
              href={watchHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {label}
            </Link>
          ) : (
            <span className="text-sm font-medium">{label}</span>
          )}
          {status === "processing" && <Badge variant="warning">Processing</Badge>}
          {status === "failed" && <Badge variant="danger">Failed</Badge>}
        </span>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>

      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`${label} actions`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {downloadHref && (
              <DropdownMenuItem asChild>
                <Link href={downloadHref} target="_blank" rel="noopener noreferrer">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Link>
              </DropdownMenuItem>
            )}
            {copyUrl && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  handleCopy();
                }}
              >
                {copyStatus === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Couldn't copy link" : copyLabel}
              </DropdownMenuItem>
            )}
            {deleteUrl && (
              <>
                {(downloadHref || copyUrl) && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    // Deferred so the dropdown finishes closing (and returning
                    // focus to its trigger) before the AlertDialog opens —
                    // opening it synchronously races Radix's focus-return and
                    // can close the dialog on the same tick it appears.
                    setTimeout(() => setConfirmOpen(true), 0);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete recording
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {deleteUrl && (
        <AlertDialog open={confirmOpen} onOpenChange={(next) => (!deletePending ? setConfirmOpen(next) : null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
              <AlertDialogDescription>
                This can&apos;t be undone. Anyone with the link will lose access immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deletePending}
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                className={buttonVariants({ variant: "destructive" })}
              >
                {deletePending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
