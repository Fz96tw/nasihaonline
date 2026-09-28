"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
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
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Host/admin-facing "Cancel Event" action, only rendered for a restricted
 * event (Audience-Restricted Group Events, Objective 03) — cancelling
 * notifies every current invitee. Once cancelled, the detail page renders a
 * plain "cancelled" state on refresh rather than the full RSVP/edit view, so
 * this navigates back to /calendar instead of staying put.
 *
 * When the event has a recording, the confirmation offers a choice instead
 * of a single "cancel" action: delete the recording now, or keep it and
 * remove it later from the event detail page / My Posts. Either way the
 * event itself gets cancelled — `hasRecordings` only controls whether that
 * extra choice is shown.
 */
export function CancelEventButton({
  eventId,
  title,
  hasRecordings,
}: {
  eventId: string;
  title: string;
  hasRecordings: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel(deleteRecordings: boolean) {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ deleteRecordings }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      router.push("/calendar");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Ban className="mr-1.5 h-4 w-4" />
        Cancel Event
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <AlertDialog open={open} onOpenChange={(next) => (!pending ? setOpen(next) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel &quot;{title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Every invited member will be notified.
              {hasRecordings &&
                " This event has a recording — you can delete it now, or keep it and remove it later from the event page or My Posts."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Never mind</AlertDialogCancel>
            {hasRecordings && (
              <AlertDialogAction
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  handleCancel(false);
                }}
                className={buttonVariants({ variant: "outline" })}
              >
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Cancel &amp; keep recording
              </AlertDialogAction>
            )}
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                handleCancel(hasRecordings);
              }}
              className={buttonVariants({ variant: "destructive" })}
            >
              {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {hasRecordings ? "Cancel & delete recording" : "Cancel event"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
