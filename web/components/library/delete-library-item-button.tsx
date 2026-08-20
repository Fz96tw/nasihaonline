"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Delete confirmation for a Knowledge Library submission — used on both
 * /library/[id] (canEdit owner/steward view) and /library/mine's row
 * actions. Unlike every other destructive action in the app (which uses a
 * plain window.confirm), this one gets a real AlertDialog: deleting a
 * Library item is higher-blast-radius (uploaded file, discussion thread and
 * its replies, search index entry all go with it) and warrants itemizing
 * the consequences rather than a single generic prompt.
 */
export function DeleteLibraryItemButton({
  itemId,
  title,
  hasEarnedHours,
  redirectTo,
}: {
  itemId: string;
  title: string;
  hasEarnedHours: boolean;
  /** Where to navigate after a successful delete. Omit to stay put and router.refresh() instead (e.g. a row disappearing from a list). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/library/${itemId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!pending ? setOpen(next) : null)}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="destructive">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{title}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the uploaded file, any discussion thread and its replies, and takes it out of
            search. This can&apos;t be undone.
            {hasEarnedHours && (
              <span className="mt-2 block">
                Your earned Knowledge Hours credit for this resource will stay on your record.
              </span>
            )}
          </AlertDialogDescription>
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
