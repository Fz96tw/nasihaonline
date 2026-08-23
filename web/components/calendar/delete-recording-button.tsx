"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Organizer-only "Delete recording" action, shared by the Event detail page
 * and the 1:1 MeetingRequest detail pane — both just DELETE a
 * .../recording endpoint and drop the link from local state on success. The
 * server call also removes the actual Drive file (lib/google-calendar.ts's
 * deleteMeetingRecording), so this is irreversible.
 */
export function DeleteRecordingButton({ deleteUrl, onDeleted }: { deleteUrl: string; onDeleted: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete this recording? This can't be undone.")) return;

    setPending(true);
    setError(null);
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
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="ghost"
        className="w-fit text-destructive hover:text-destructive"
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        Delete recording
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
