"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { RoomEvent, type RemoteParticipant } from "livekit-client";
import { LiveKitRoom, VideoConference, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { getCsrfToken } from "@/lib/csrf-client";
import { getPublicMeetingClosingNote } from "@/lib/legal";

const DISCLAIMER_FLASH_DURATION_MS = 10_000;

/**
 * Private, per-viewer reminder of the disclaimer already agreed to at the
 * pre-join gate (user request, 2026-08-24) — local React state only, never
 * broadcast via LiveKit, so only the person who just joined sees it.
 * Auto-dismisses, or can be closed early. Only rendered for a meeting that
 * required the click-through gate in the first place (open events); a
 * private/invited meeting's attendees already agreed to the community-wide
 * Code of Conduct once at /join, so this would be redundant there.
 */
function DisclaimerReminderFlash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), DISCLAIMER_FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-auto fixed left-1/2 top-20 z-50 w-full max-w-sm -translate-x-1/2 rounded-lg border bg-background p-3 text-left shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{getPublicMeetingClosingNote("livekit")}</p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss reminder"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const TOAST_DURATION_MS = 5_000;

type Toast = { id: string; message: string };

/**
 * Transient join/leave alerts (user request, 2026-08-24) — must render
 * inside <LiveKitRoom> to reach useRoomContext(). RoomEvent.ParticipantConnected/
 * Disconnected only fire for *remote* participants, which is correct here:
 * nobody needs to be told they themselves joined.
 */
function ParticipantActivityToasts() {
  const room = useRoomContext();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function push(message: string) {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message }]);
      setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), TOAST_DURATION_MS);
    }
    function onConnected(participant: RemoteParticipant) {
      push(`${participant.name || participant.identity} joined`);
    }
    function onDisconnected(participant: RemoteParticipant) {
      push(`${participant.name || participant.identity} left`);
    }
    room.on(RoomEvent.ParticipantConnected, onConnected);
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
    };
  }, [room]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-md bg-foreground/90 px-3 py-2 text-sm text-background shadow-lg"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/**
 * Full-viewport embedded LiveKit call, rendered by MeetingWaitingRoom once
 * a LiveKit-backed Event/MeetingRequest's meeting has started (LiveKit
 * Meeting Infrastructure initiative). Fetches a join token server-side —
 * the LiveKit API secret never reaches the client — then renders the
 * prefab VideoConference with a title/host banner and join/leave alerts.
 */
export function LiveKitMeetingScreen({
  tokenEndpoint,
  title,
  organizerName,
  showDisclaimerReminder,
}: {
  tokenEndpoint: string;
  title: string;
  organizerName: string;
  /** True for an open Event's attendee (whoever passed the pre-join Code of Conduct gate) — see DisclaimerReminderFlash. */
  showDisclaimerReminder: boolean;
}) {
  const [credentials, setCredentials] = useState<{ token: string; serverUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchToken() {
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(tokenEndpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't connect to the meeting.");
        }
        const data = await res.json();
        if (!cancelled) setCredentials(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't connect to the meeting.");
      }
    }
    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [tokenEndpoint]);

  if (error) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background p-8 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background p-8 text-center">
        <p className="text-muted-foreground">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <div className="border-b bg-background px-4 py-2 text-center">
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">Hosted by {organizerName}</p>
      </div>
      <div className="flex-1">
        <LiveKitRoom
          token={credentials.token}
          serverUrl={credentials.serverUrl}
          connect
          data-lk-theme="default"
          style={{ height: "100%" }}
        >
          <ParticipantActivityToasts />
          {showDisclaimerReminder && <DisclaimerReminderFlash />}
          <VideoConference />
        </LiveKitRoom>
      </div>
    </div>
  );
}
