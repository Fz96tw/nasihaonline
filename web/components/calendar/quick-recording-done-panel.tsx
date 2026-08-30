"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCsrfToken } from "@/lib/csrf-client";
import type { QuickRecordingProcessingStatus } from "@/lib/quick-recordings-server";

const POLL_INTERVAL_MS = 3_000;

/**
 * Processing/done panel (Quick Video Recording & Sharing initiative) —
 * polls GET /api/quick-recordings/:id/status until the egress_ended webhook
 * attaches the recording (`ready`) or marks it `failed`, mirroring
 * MeetingWaitingRoom's poll+AbortController shape. No retry on failure in
 * v1 (per objective) — the failed state is terminal.
 */
export function QuickRecordingDonePanel({
  meetingRequestId,
  initialStatus,
}: {
  meetingRequestId: string;
  initialStatus: QuickRecordingProcessingStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [topicDraft, setTopicDraft] = useState(initialStatus.topic);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const done = status.ready || status.failed;

  useEffect(() => {
    if (done) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/quick-recordings/${meetingRequestId}/status`, { signal: controller.signal });
        if (!res.ok || cancelled) return;
        const data: QuickRecordingProcessingStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        // Transient poll failure (including our own abort) — next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [done, meetingRequestId]);

  const saveTopic = useCallback(async () => {
    const trimmed = topicDraft.trim();
    if (!trimmed || trimmed === status.topic) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/quick-recordings/${meetingRequestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ topic: trimmed }),
      });
      if (!res.ok) throw new Error("Couldn't rename. Please try again.");
      setStatus((prev) => ({ ...prev, topic: trimmed }));
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Couldn't rename. Please try again.");
    } finally {
      setRenaming(false);
    }
  }, [meetingRequestId, topicDraft, status.topic]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-6 p-8">
      <div className="flex w-full flex-col items-center gap-2 text-center">
        {status.failed ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-destructive">Recording failed</h1>
            <p className="text-muted-foreground">
              Something went wrong while processing this recording. It couldn&apos;t be saved.
            </p>
          </>
        ) : status.ready ? (
          <h1 className="text-2xl font-bold tracking-tight">Your recording is ready</h1>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Processing…</h1>
            <p className="text-muted-foreground">This usually only takes a moment.</p>
          </>
        )}
      </div>

      {status.ready && status.recordingId && (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- source is a raw screen-share/webcam capture, no track to caption
        <video
          controls
          src={`/api/inbox/meeting-requests/${meetingRequestId}/recording/${status.recordingId}`}
          className="w-full rounded-lg border"
        />
      )}

      {!status.failed && (
        <div className="flex w-full flex-col gap-2">
          <label htmlFor="quick-recording-name" className="text-sm font-medium">
            Name
          </label>
          <div className="flex gap-2">
            <Input
              id="quick-recording-name"
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              disabled={renaming}
            />
            <Button
              type="button"
              variant="outline"
              onClick={saveTopic}
              disabled={renaming || !topicDraft.trim() || topicDraft.trim() === status.topic}
            >
              {renaming ? "Saving…" : "Save"}
            </Button>
          </div>
          {renameError && <p className="text-sm text-destructive">{renameError}</p>}
        </div>
      )}

      <Button asChild variant="ghost">
        <a href="/dashboard">Back to Dashboard</a>
      </Button>
    </main>
  );
}
