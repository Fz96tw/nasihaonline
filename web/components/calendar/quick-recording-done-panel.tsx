"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [topicDraft, setTopicDraft] = useState(initialStatus.topic);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
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
    if (!trimmed) return;
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
  }, [meetingRequestId, topicDraft]);

  /**
   * Shared by Discard and Re-record — both delete the recording via the
   * already-existing DELETE /api/quick-recordings/:id route (same one the
   * dashboard's "My Quick Recordings" list uses), only the post-delete
   * destination differs (see handleDiscard/handleReRecord below). Returns
   * whether the delete succeeded, so each caller decides where to navigate.
   */
  const discardRecording = useCallback(async (): Promise<boolean> => {
    setDiscarding(true);
    setDiscardError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/quick-recordings/${meetingRequestId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setDiscardError(typeof payload?.error === "string" ? payload.error : "Couldn't discard. Please try again.");
        return false;
      }
      return true;
    } catch {
      setDiscardError("Couldn't discard. Please try again.");
      return false;
    } finally {
      setDiscarding(false);
    }
  }, [meetingRequestId]);

  const handleDiscard = useCallback(async () => {
    if (!window.confirm("Discard this recording? This can't be undone.")) return;
    if (await discardRecording()) router.push("/dashboard");
  }, [discardRecording, router]);

  /**
   * Discards this take, then creates a BRAND-NEW quick recording (same
   * one-click POST /api/quick-recordings QuickRecordingButton already
   * uses) rather than returning to this one's now-stopped room. The
   * original room goes empty the instant its sole solo participant
   * disconnects on Stop, and once LiveKit's emptyTimeout elapses,
   * room_finished resets this MeetingRequest's meetingStartedAt back to
   * null (resetMeetingOnRoomEmpty, lib/livekit.ts — built for the regular
   * waiting-room lifecycle, not quick recordings) — reconnecting to it
   * would then 409 with "This meeting hasn't started yet." A fresh
   * recording sidesteps that entirely and matches every other "start a
   * quick recording" entry point.
   */
  const handleReRecord = useCallback(async () => {
    if (!window.confirm("Discard this recording and start a new one?")) return;
    if (!(await discardRecording())) return;
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch("/api/quick-recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const data: { id: string } = await res.json();
      router.push(`/meet/quick/${data.id}`);
    } catch {
      setDiscardError("Discarded, but couldn't start a new recording. Please try again from the dashboard.");
    }
  }, [discardRecording, router]);

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
          <p className="text-sm text-muted-foreground">
            This recording is saved as <span className="font-medium text-foreground">{status.topic}</span>. You can
            rename it if needed.
          </p>
          <div className="flex gap-2">
            <Input
              id="quick-recording-name"
              aria-label="Recording name"
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              disabled={renaming}
            />
            <Button
              type="button"
              variant="outline"
              onClick={saveTopic}
              disabled={renaming || !topicDraft.trim()}
            >
              {renaming ? "Updating…" : "Update Name"}
            </Button>
          </div>
          {renameError && <p className="text-sm text-destructive">{renameError}</p>}
        </div>
      )}

      <div className="flex w-full flex-col items-center gap-3">
        <Button asChild>
          <a href="/dashboard">Back to Dashboard</a>
        </Button>
        <p className="text-center text-sm">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={discarding}
            className="font-medium text-destructive hover:underline disabled:opacity-50"
          >
            Discard this recording
          </button>
          <span className="mx-2 text-muted-foreground">·</span>
          <button
            type="button"
            onClick={handleReRecord}
            disabled={discarding}
            className="font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          >
            Re-record instead
          </button>
        </p>
        {discardError && <p className="text-sm text-destructive">{discardError}</p>}
      </div>
    </main>
  );
}
