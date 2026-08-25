"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { RoomEvent, type RemoteParticipant } from "livekit-client";
import { LiveKitRoom, VideoConference, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { getCsrfToken } from "@/lib/csrf-client";
import { getPublicMeetingClosingNote } from "@/lib/legal";

/**
 * Per-viewer reminder of the meeting's conduct/platform disclaimer — local
 * React state only, never broadcast via LiveKit, so only the person who
 * just joined sees it. Centered and click-to-dismiss (user request,
 * 2026-08-25) rather than auto-fading, so it doesn't disappear before
 * someone's actually read it. Shown for every LiveKit meeting (user
 * request, 2026-08-25) — originally gated to open events only, on the
 * theory that a private/invited meeting's attendees already agreed to the
 * community-wide Code of Conduct once at /join, but that made it
 * inconsistently absent depending on the event's visibility.
 *
 * Deliberately NOT rendered inside <LiveKitRoom> (doesn't need
 * useRoomContext()) — reported not visible at all when it was: an
 * absolutely-positioned overlay nested inside LiveKitRoom's own DOM tree
 * risks losing to its internal layout/stacking in ways that are opaque
 * from the outside. Rendering it as a sibling at the top level, same as
 * the banner below, avoids that entirely.
 */
function DisclaimerReminderFlash() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="pointer-events-auto w-full max-w-sm cursor-pointer rounded-lg border bg-background p-4 text-left shadow-lg"
      >
        <p className="text-sm text-muted-foreground">{getPublicMeetingClosingNote("livekit")}</p>
        <p className="mt-2 text-xs font-medium text-muted-foreground">Tap to dismiss</p>
      </button>
    </div>
  );
}

const TOAST_DURATION_MS = 5_000;

type Toast = { id: string; message: string };

/**
 * Listens for remote participant join/leave events — must render inside
 * <LiveKitRoom> to reach useRoomContext(), but renders no UI of its own.
 * Reports each event up to the parent via onEvent, so the actual toast
 * stack can live outside LiveKitRoom's DOM tree (see ParticipantActivityToasts'
 * doc comment on why that matters — the disclaimer flash had the identical
 * "invisible when nested inside LiveKitRoom" bug). RoomEvent.ParticipantConnected/
 * Disconnected only fire for *remote* participants, which is correct here:
 * nobody needs to be told they themselves joined.
 */
function ParticipantActivityListener({ onEvent }: { onEvent: (message: string) => void }) {
  const room = useRoomContext();

  useEffect(() => {
    function onConnected(participant: RemoteParticipant) {
      onEvent(`${participant.name || participant.identity} joined`);
    }
    function onDisconnected(participant: RemoteParticipant) {
      onEvent(`${participant.name || participant.identity} left`);
    }
    room.on(RoomEvent.ParticipantConnected, onConnected);
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
    };
  }, [room, onEvent]);

  return null;
}

type RoomRecordingMetadata = { recording: boolean; egressId: string | null };

/**
 * Mirrors ParticipantActivityListener's shape exactly — must render inside
 * <LiveKitRoom> to reach useRoomContext(), reports state up via callbacks so
 * the actual Record/Stop button can live outside LiveKitRoom's DOM tree
 * (objective 4). Room metadata (not a data-channel message) is the sync
 * mechanism: the server sets it once via RoomServiceClient.updateRoomMetadata
 * whenever recording starts/stops (lib/livekit.ts), and LiveKit already
 * pushes RoomEvent.RoomMetadataChanged to every connected client for free —
 * that's what keeps "any attendee can start/stop" in sync across everyone
 * in the room without extra plumbing. The initial mount read is silent (no
 * toast) — only actual transitions after that toast, so joining a call
 * that's already recording doesn't announce a false "started".
 */
function RecordingStateListener({
  onChange,
  onToast,
}: {
  onChange: (recording: boolean) => void;
  onToast: (message: string) => void;
}) {
  const room = useRoomContext();
  const previousRef = useRef<boolean | null>(null);

  useEffect(() => {
    function apply(metadata: string | undefined) {
      let recording = false;
      if (metadata) {
        try {
          recording = (JSON.parse(metadata) as Partial<RoomRecordingMetadata>).recording === true;
        } catch {
          recording = false;
        }
      }
      onChange(recording);
      if (previousRef.current !== null && previousRef.current !== recording) {
        onToast(recording ? "Recording started" : "Recording stopped");
      }
      previousRef.current = recording;
    }

    apply(room.metadata);
    function onMetadataChanged(metadata: string) {
      apply(metadata);
    }
    room.on(RoomEvent.RoomMetadataChanged, onMetadataChanged);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, onMetadataChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  return null;
}

/**
 * Floating Record/Stop control, any attendee can use it (objective 4) —
 * same absolutely-positioned-sibling pattern as the other overlays here.
 * `recording` reflects the live room-metadata-synced state from
 * RecordingStateListener, not local optimistic state, so the button always
 * shows the true shared state even if someone else started/stopped it.
 */
function RecordingControl({
  recording,
  startEndpoint,
  stopEndpoint,
  onError,
}: {
  recording: boolean;
  startEndpoint: string;
  stopEndpoint: string;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(recording ? stopEndpoint : startEndpoint, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        onError(typeof payload?.error === "string" ? payload.error : "Couldn't update recording. Try again.");
      }
      // On success, the button's own state updates via the room-metadata
      // broadcast (RecordingStateListener), not this response directly —
      // keeps this client in sync the exact same way every other client is.
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-50">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur disabled:opacity-60"
      >
        <span className={`h-2.5 w-2.5 rounded-full ${recording ? "animate-pulse bg-destructive" : "bg-muted-foreground"}`} />
        {recording ? "Stop recording" : "Record"}
      </button>
    </div>
  );
}

/** The visible toast stack — a sibling of <LiveKitRoom>, not nested inside it (see ParticipantActivityListener). */
function ParticipantActivityToasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="rounded-md bg-foreground/90 px-3 py-2 text-sm text-background shadow-lg">
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
 *
 * The banner, disclaimer flash, and toast stack are all rendered as
 * absolutely-positioned overlays *outside* <LiveKitRoom>'s own children,
 * layered on top of it via the shared `fixed inset-0` wrapper below.
 *
 * The wrapper's z-index must clear `components/scroll-header.tsx`'s
 * persistent site header (`sticky top-0 z-50`) — confirmed via live
 * Playwright testing (2026-08-24) that a `z-40` wrapper here renders
 * genuinely visible-per-computed-style content that is nonetheless
 * painted *underneath* the header, since the header establishes its own
 * stacking context and 50 > 40 there; this page is rendered inside the
 * normal `(member)` layout, so the header is always present in the DOM
 * above it. (@livekit/components-styles itself has only one z-index rule
 * in the entire package, `.lk-device-menu` at z-index:5 — it is not the
 * competing layer.) Kept comfortably above 50 (`z-[60]`) rather than
 * exactly 51, so a future header bump doesn't silently reopen this.
 */
export function LiveKitMeetingScreen({
  tokenEndpoint,
  recordingStartEndpoint,
  recordingStopEndpoint,
  title,
  organizerName,
  backHref,
}: {
  tokenEndpoint: string;
  /** POST endpoints for the Record/Stop control — any attendee can use them (objective 4), same auth as tokenEndpoint. */
  recordingStartEndpoint: string;
  recordingStopEndpoint: string;
  title: string;
  organizerName: string;
  /** Where to navigate once the participant leaves the call (VideoConference's built-in Leave button, or a connection drop) — same destination the page's own BackLink uses. */
  backHref: string;
}) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ token: string; serverUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recording, setRecording] = useState(false);

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

  function pushToast(message: string) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), TOAST_DURATION_MS);
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background p-8 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background p-8 text-center">
        <p className="text-muted-foreground">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center p-2">
        <div className="pointer-events-auto rounded-md border bg-background/95 px-4 py-2 text-center shadow-sm backdrop-blur">
          <div className="mb-1 flex items-center justify-center gap-1.5">
            <Image src="/images/nasihalogo-cropped.png" alt="NASIHA" width={296} height={334} className="h-3.5 w-auto" />
            <span className="text-[.6rem] font-black uppercase leading-none tracking-[.1em] text-logo">
              nasihaforyou.org
            </span>
          </div>
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">Hosted by {organizerName}</p>
        </div>
      </div>
      <DisclaimerReminderFlash />
      <ParticipantActivityToasts toasts={toasts} />
      <RecordingControl
        recording={recording}
        startEndpoint={recordingStartEndpoint}
        stopEndpoint={recordingStopEndpoint}
        onError={pushToast}
      />
      <LiveKitRoom
        token={credentials.token}
        serverUrl={credentials.serverUrl}
        connect
        data-lk-theme="default"
        style={{ height: "100%" }}
        // replace, not push — the meeting page (this same URL) is already
        // the current history entry; pushing on top of it left it reachable
        // via the browser Back button, which would land back on a still-
        // `started` meeting and immediately reconnect (reported 2026-08-25).
        onDisconnected={() => router.replace(backHref)}
      >
        <ParticipantActivityListener onEvent={pushToast} />
        <RecordingStateListener onChange={setRecording} onToast={pushToast} />
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
