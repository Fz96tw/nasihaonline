"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDurationMinutes } from "@/lib/format-date";
import { getCsrfToken } from "@/lib/csrf-client";

// Mirrors lib/quick-recordings-server.ts's QuickRecordingListItem — kept as
// a separate client-side type rather than importing it (a "server-only"
// module), same convention meeting-waiting-room.tsx's MeetingWaitingRoomStatus
// follows for the same reason.
export type QuickRecordingListItem = {
  id: string;
  meetingRequestId: string;
  topic: string;
  createdAt: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  ready: boolean;
  failed: boolean;
  shared: { label: string; href: string } | null;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

/** No existing byte-formatting convention elsewhere in the app (file sizes aren't shown anywhere else yet) — a small local helper, same as formatDate above. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function QuickRecordingRow({
  recording,
  onChanged,
  onDeleted,
}: {
  recording: QuickRecordingListItem;
  onChanged: (updated: QuickRecordingListItem) => void;
  onDeleted: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [topicDraft, setTopicDraft] = useState(recording.topic);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRename() {
    const trimmed = topicDraft.trim();
    if (!trimmed || trimmed === recording.topic) {
      setRenaming(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/quick-recordings/${recording.meetingRequestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ topic: trimmed }),
      });
      if (!res.ok) throw new Error("Couldn't rename. Please try again.");
      onChanged({ ...recording, topic: trimmed });
      setRenaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/quick-recordings/${recording.meetingRequestId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) throw new Error("Couldn't delete. Please try again.");
      setConfirmOpen(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {renaming ? (
            <div className="flex items-center gap-2">
              <Input
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                disabled={saving}
                className="h-8"
                autoFocus
              />
              <Button size="sm" variant="outline" onClick={saveRename} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{recording.topic}</span>
              {recording.failed && <Badge variant="danger">Failed</Badge>}
              {!recording.ready && !recording.failed && <Badge variant="warning">Processing</Badge>}
              {recording.shared && <Badge variant="info">Shared</Badge>}
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDate(recording.createdAt)}
            {recording.durationSeconds != null && ` · ${formatDurationMinutes(recording.durationSeconds)}`}
            {recording.sizeBytes != null && ` · ${formatBytes(recording.sizeBytes)}`}
          </span>
          {recording.shared && (
            <Link href={recording.shared.href} className="w-fit text-xs text-primary underline-offset-4 hover:underline">
              {recording.shared.label}
            </Link>
          )}
        </div>

        {!renaming && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={`Rename ${recording.topic}`}
              onClick={() => {
                setTopicDraft(recording.topic);
                setRenaming(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:text-destructive"
              aria-label={`Delete ${recording.topic}`}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {recording.ready && (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- source is a raw screen-share/webcam capture, no track to caption
        <video
          controls
          preload="metadata"
          src={`/api/inbox/meeting-requests/${recording.meetingRequestId}/recording/${recording.id}`}
          className="w-fit max-h-56 max-w-full self-start rounded-md border"
        />
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={(next) => (!deleting ? setConfirmOpen(next) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
            <AlertDialogDescription>
              {recording.shared ? (
                <>
                  This recording is currently <strong>{recording.shared.label.toLowerCase()}</strong>. Deleting it
                  will remove the video file — anyone viewing it there will see a &ldquo;deleted by owner&rdquo;
                  message instead. This can&apos;t be undone.
                </>
              ) : (
                "This can't be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className={buttonVariants({ variant: "destructive" })}
            >
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Client interactive list backing the Dashboard's "My Quick Recordings" section (video-library objective) — receives its initial data server-rendered, then manages rename/delete locally. */
export function QuickRecordingsList({ initialRecordings }: { initialRecordings: QuickRecordingListItem[] }) {
  const [recordings, setRecordings] = useState(initialRecordings);

  if (recordings.length === 0) {
    return <p className="text-sm text-muted-foreground">You haven&apos;t recorded a quick video yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {recordings.map((recording) => (
        <QuickRecordingRow
          key={recording.id}
          recording={recording}
          onChanged={(updated) =>
            setRecordings((current) => current.map((r) => (r.id === updated.id ? updated : r)))
          }
          onDeleted={() => setRecordings((current) => current.filter((r) => r.id !== recording.id))}
        />
      ))}
    </div>
  );
}
