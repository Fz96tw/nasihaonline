"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getCsrfToken } from "@/lib/csrf-client";
import { useHasMounted } from "@/lib/use-has-mounted";

const POLL_INTERVAL_MS = 5_000;

export type MeetingWaitingRoomStatus = {
  started: boolean;
  startsAt: string;
  meetingUrl: string | null;
  organizerMessage: string | null;
  organizerMessageImageUrl: string | null;
  isOrganizer: boolean;
  configured: boolean;
};

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * In-app waiting room (meeting-join-experience) for both Event and
 * MeetingRequest Meet links — the parent page passes entity-specific
 * status/start/message endpoints so this component stays entity-agnostic.
 * Polls status every 5s (same useEffect+setInterval+AbortController shape
 * as notification-bell.tsx) and redirects the moment `started` flips true;
 * the organizer additionally gets a message/image editor and the Start
 * control right on this same page.
 */
export function MeetingWaitingRoom({
  initialStatus,
  statusEndpoint,
  startEndpoint,
  resetEndpoint,
  messageEndpoint,
}: {
  initialStatus: MeetingWaitingRoomStatus;
  statusEndpoint: string;
  startEndpoint: string;
  resetEndpoint: string;
  messageEndpoint: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [now, setNow] = useState(() => Date.now());
  const [messageDraft, setMessageDraft] = useState(initialStatus.organizerMessage ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(statusEndpoint, { signal: controller.signal });
      if (!res.ok) return;
      const data: MeetingWaitingRoomStatus = await res.json();
      setStatus(data);
    } catch {
      // Transient poll failure (including our own abort) — next tick retries.
    }
  }, [statusEndpoint]);

  useEffect(() => {
    const pollInterval = setInterval(refresh, POLL_INTERVAL_MS);
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(clockInterval);
      abortRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    // The organizer never auto-redirects — meetingStartedAt has no "ended"
    // concept, so once true it stays true forever; the organizer needs to
    // stay on this page to Join again (after quitting) or Reset it.
    if (status.started && status.meetingUrl && !status.isOrganizer) {
      window.location.href = status.meetingUrl;
    }
  }, [status.started, status.meetingUrl, status.isOrganizer]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(startEndpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStarting(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(resetEndpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setResetting(false);
    }
  }

  async function handleSaveMessage() {
    setSavingMessage(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const formData = new FormData();
      if (messageDraft.trim()) formData.append("message", messageDraft.trim());
      if (image) formData.append("image", image);
      if (removeImage) formData.append("removeImage", "true");
      const res = await fetch(messageEndpoint, {
        method: "PATCH",
        headers: { "x-csrf-token": csrfToken },
        body: formData,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setImage(null);
      setRemoveImage(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSavingMessage(false);
    }
  }

  const msRemaining = new Date(status.startsAt).getTime() - now;
  const isBeforeStart = msRemaining > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold tracking-tight">
        {status.isOrganizer ? (status.started ? "Meeting started" : "Start your meeting") : "Waiting for the meeting to start"}
      </h1>

      {!status.isOrganizer && (
        <p className="text-muted-foreground">
          {hasMounted
            ? isBeforeStart
              ? `Starts in ${formatCountdown(msRemaining)}`
              : "Waiting for the host to start the meeting…"
            : null}
        </p>
      )}

      {status.organizerMessageImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, same rationale as other attachment images
        <img src={status.organizerMessageImageUrl} alt="" className="max-h-64 w-full rounded-lg object-cover" />
      )}
      {status.organizerMessage && <p className="whitespace-pre-wrap text-sm">{status.organizerMessage}</p>}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {status.isOrganizer && (
        <div className="flex w-full flex-col gap-4 rounded-lg border p-4 text-left">
          <div className="flex flex-col gap-2">
            <label htmlFor="waiting-room-message" className="text-sm font-medium">
              Message for attendees (optional)
            </label>
            <Textarea
              id="waiting-room-message"
              rows={3}
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="waiting-room-image" className="text-sm font-medium">
              Image (optional)
            </label>
            {status.organizerMessageImageUrl && !image && !removeImage && (
              <button
                type="button"
                className="w-fit text-xs text-destructive underline"
                onClick={() => setRemoveImage(true)}
              >
                Remove current image
              </button>
            )}
            <input
              id="waiting-room-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setImage(e.target.files?.[0] ?? null);
                setRemoveImage(false);
              }}
              className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
            />
          </div>
          <Button type="button" variant="outline" onClick={handleSaveMessage} disabled={savingMessage}>
            {savingMessage ? "Saving…" : "Save message"}
          </Button>
          {status.started && status.meetingUrl ? (
            <>
              <Button type="button" asChild>
                <a href={status.meetingUrl} target="_blank" rel="noopener noreferrer">
                  Join Meet
                </a>
              </Button>
              <Button type="button" variant="ghost" onClick={handleReset} disabled={resetting}>
                {resetting ? "Resetting…" : "Reset waiting room"}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={handleStart} disabled={starting}>
              {starting ? "Starting…" : "Start Meeting"}
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
