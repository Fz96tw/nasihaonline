"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BackLink } from "@/components/back-link";
import { getCsrfToken } from "@/lib/csrf-client";
import {
  PUBLIC_MEETING_CLOSING_NOTE,
  PUBLIC_MEETING_CODE_OF_CONDUCT,
  PUBLIC_MEETING_DISCLAIMER_SECTIONS,
} from "@/lib/legal";
import { useHasMounted } from "@/lib/use-has-mounted";

const POLL_INTERVAL_MS = 5_000;

export type MeetingWaitingRoomStatus = {
  title: string;
  organizerName: string;
  started: boolean;
  startsAt: string;
  meetingUrl: string | null;
  organizerMessage: string | null;
  organizerMessageImageUrl: string | null;
  isOrganizer: boolean;
  configured: boolean;
  requiresCodeOfConductAgreement: boolean;
};

/** Always hours:minutes:seconds, zero-padded — a fixed-width format reads better at large sizes than one that reflows as hours drop off. */
function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Same weekday/month/day/hour/minute/timeZoneName shape as
// meeting-request-detail.tsx's formatTimestamp — client-only (hasMounted-
// gated by the caller) since the server process's own timezone isn't the
// viewer's.
function formatScheduledTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
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
  backHref,
}: {
  initialStatus: MeetingWaitingRoomStatus;
  statusEndpoint: string;
  startEndpoint: string;
  resetEndpoint: string;
  messageEndpoint: string;
  backHref: string;
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
  // Click-through only, never persisted — re-shown on every join, per the
  // "every time" decision for this gate (no account for an anonymous
  // visitor to remember it against anyway).
  const [agreedToDisclaimer, setAgreedToDisclaimer] = useState(false);
  const hasMounted = useHasMounted();
  const abortRef = useRef<AbortController | null>(null);
  const hasAutoOpenedRef = useRef(false);

  const refresh = useCallback(async (): Promise<MeetingWaitingRoomStatus | undefined> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(statusEndpoint, { signal: controller.signal });
      if (!res.ok) return undefined;
      const data: MeetingWaitingRoomStatus = await res.json();
      setStatus(data);
      return data;
    } catch {
      // Transient poll failure (including our own abort) — next tick retries.
      return undefined;
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
    // Reset so a subsequent Start (after the organizer Resets) can
    // auto-open again — meetingStartedAt has no "ended" concept, so
    // `started` can go true → false → true within one page load.
    if (!status.started) hasAutoOpenedRef.current = false;
  }, [status.started]);

  useEffect(() => {
    // The organizer never auto-opens — meetingStartedAt has no "ended"
    // concept, so once true it stays true forever; the organizer needs to
    // stay on this page to Join again (after quitting) or Reset it. An
    // open event's attendee also holds here until they click through the
    // Code of Conduct disclaimer below. Opens a new tab (rather than
    // navigating this one away) so the member keeps the app open; only
    // tried once per Start, since this fires from a status poll rather
    // than a direct click, so most browsers may block it as a popup — the
    // Join Meet button rendered below is the fallback if so.
    if (
      status.started &&
      status.meetingUrl &&
      !status.isOrganizer &&
      (!status.requiresCodeOfConductAgreement || agreedToDisclaimer) &&
      !hasAutoOpenedRef.current
    ) {
      hasAutoOpenedRef.current = true;
      const meetingWindow = window.open(status.meetingUrl, "_blank");
      if (meetingWindow) meetingWindow.opener = null;
    }
  }, [status.started, status.meetingUrl, status.isOrganizer, status.requiresCodeOfConductAgreement, agreedToDisclaimer]);

  async function handleStart() {
    setStarting(true);
    setError(null);
    // Opened blank synchronously, before the first await, so browsers still
    // treat it as a direct response to the click rather than an untrusted
    // script-triggered popup, then navigated once we know the real URL —
    // getEventMeetingStatus/getMeetingRequestMeetingStatus withhold
    // meetingUrl until meetingStartedAt is set, so it isn't known until
    // after the start request round-trips. Collapses Start + Join into one
    // click for the organizer, who otherwise had to click Start, wait for
    // the status poll/refresh, then click a second Join Meet button.
    // Can't pass the "noopener" feature here — browsers return null from
    // window.open when it's set, and we need the handle to navigate this
    // tab later. Clearing .opener by hand gets the same reverse-tabnabbing
    // protection without losing the reference.
    const meetingWindow = window.open("", "_blank");
    if (meetingWindow) meetingWindow.opener = null;
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(startEndpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } });
      if (!res.ok) {
        meetingWindow?.close();
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      const updated = await refresh();
      if (updated?.meetingUrl && meetingWindow) {
        meetingWindow.location.href = updated.meetingUrl;
      } else {
        meetingWindow?.close();
      }
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
  const needsDisclaimerGate =
    !status.isOrganizer && status.started && status.meetingUrl !== null && status.requiresCodeOfConductAgreement && !agreedToDisclaimer;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 p-8 text-center">
      <BackLink
        fallbackHref={backHref}
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:underline"
      />
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{status.title}</h1>
        <p className="text-sm text-muted-foreground">Hosted by {status.organizerName}</p>
        {hasMounted && <p className="text-sm text-muted-foreground">{formatScheduledTime(status.startsAt)}</p>}
      </div>

      {status.isOrganizer ? (
        status.started ? (
          status.meetingUrl ? (
            <Button type="button" size="lg" asChild>
              <a href={status.meetingUrl} target="_blank" rel="noopener noreferrer">
                Join Meet
              </a>
            </Button>
          ) : (
            <p className="text-lg font-medium">Meeting started</p>
          )
        ) : (
          <Button type="button" size="lg" onClick={handleStart} disabled={starting}>
            {starting ? "Starting…" : "Start Meeting"}
          </Button>
        )
      ) : (
        <p className="text-lg font-medium">
          {status.started ? "The meeting has started" : "Waiting for the meeting to start"}
        </p>
      )}

      {!status.isOrganizer && hasMounted && (
        <>
          {needsDisclaimerGate ? (
            <div className="flex w-full flex-col gap-3 rounded-lg border p-4 text-left">
              <p className="text-sm font-medium">Before you join</p>
              <p className="text-xs text-muted-foreground">
                This is a NASIHA community meeting, open to the public. By joining, you agree to the following:
              </p>
              {PUBLIC_MEETING_DISCLAIMER_SECTIONS.map((section) => (
                <div key={section.heading}>
                  <p className="text-xs font-semibold">{section.heading}</p>
                  <p className="text-xs text-muted-foreground">{section.body}</p>
                </div>
              ))}
              <div>
                <p className="text-xs font-semibold">Code of Conduct</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {PUBLIC_MEETING_CODE_OF_CONDUCT.map((principle) => (
                    <li key={principle}>{principle}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">{PUBLIC_MEETING_CLOSING_NOTE}</p>
              <Button type="button" onClick={() => setAgreedToDisclaimer(true)}>
                I Agree — Join Meeting
              </Button>
            </div>
          ) : status.started ? (
            // The effect above already tried opening this in a new tab; this
            // is the fallback for when the browser blocked that (it fires
            // from a status poll, not a direct click, so most browsers may
            // treat it as an unrequested popup) or the member closed that tab.
            <Button type="button" size="lg" asChild>
              <a href={status.meetingUrl ?? undefined} target="_blank" rel="noopener noreferrer">
                Join Meet
              </a>
            </Button>
          ) : isBeforeStart ? (
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm text-muted-foreground">Starts in</p>
              <p className="font-mono text-7xl font-bold tabular-nums tracking-tight">
                {formatCountdown(msRemaining)}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">Waiting for the host to start the meeting…</p>
          )}
        </>
      )}

      {status.organizerMessageImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, same rationale as other attachment images
        <img src={status.organizerMessageImageUrl} alt="" className="max-h-64 w-full rounded-lg object-contain" />
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
              accept="image/jpeg,image/png,image/webp,image/gif"
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
          {status.started && (
            <Button type="button" variant="ghost" onClick={handleReset} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset waiting room"}
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
