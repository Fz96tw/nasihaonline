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
 * Host/admin-only "Delete Discussion" on /calendar/[eventId], next to the
 * "Discussion" heading — mirrors RecordingRow's delete affordance for the
 * same event page. Unlike DeleteForumThreadButton (standalone threads,
 * soft-deleted), deleteForumThread hard-deletes an event-linked thread —
 * ForumThread.eventId is @unique, so the row can't just be flagged removed
 * without permanently blocking a fresh "Start a Discussion" — which also
 * means every reply from other members is destroyed, not just hidden. The
 * confirmation copy says so. On success, refreshes so the page re-fetches:
 * the Discussion section disappears and EventDiscussionLink's "Start a
 * Discussion" button reappears (event.forumThreadId is genuinely gone now).
 */
export function DeleteEventDiscussionButton({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/forums/threads/${threadId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
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
          Delete Discussion
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this discussion?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the discussion thread for this event, including every reply from other members.
            This can&apos;t be undone — but a new discussion can be started for the event afterward.
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
