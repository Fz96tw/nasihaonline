"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { RoomEvent, type RemoteParticipant } from "livekit-client";
import { LiveKitRoom, VideoConference, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { getCsrfToken } from "@/lib/csrf-client";
import { getPublicMeetingClosingNote } from "@/lib/legal";

/**
 * Private, per-viewer reminder of the disclaimer already agreed to at the
 * pre-join gate (user request, 2026-08-24) — local React state only, never
 * broadcast via LiveKit, so only the person who just joined sees it.
 * Centered and click-to-dismiss (user request, 2026-08-25) rather than
 * auto-fading, so it doesn't disappear before someone's actually read it.
 * Only rendered for a meeting that required the click-through gate in the
 * first place (open events); a private/invited meeting's attendees already
 * agreed to the community-wide Code of Conduct once at /join, so this would
 * be redundant there.
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

/** The visible toast stack — a sibling of <LiveKitRoom>, not nested inside it (see ParticipantActivityListener). */
function ParticipantActivityToasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-4 top-16 z-50 flex flex-col gap-2">
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
  title,
  organizerName,
  showDisclaimerReminder,
  backHref,
}: {
  tokenEndpoint: string;
  title: string;
  organizerName: string;
  /** True for an open Event's attendee (whoever passed the pre-join Code of Conduct gate) — see DisclaimerReminderFlash. */
  showDisclaimerReminder: boolean;
  /** Where to navigate once the participant leaves the call (VideoConference's built-in Leave button, or a connection drop) — same destination the page's own BackLink uses. */
  backHref: string;
}) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ token: string; serverUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

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
      {showDisclaimerReminder && <DisclaimerReminderFlash />}
      <ParticipantActivityToasts toasts={toasts} />
      <LiveKitRoom
        token={credentials.token}
        serverUrl={credentials.serverUrl}
        connect
        data-lk-theme="default"
        style={{ height: "100%" }}
        onDisconnected={() => router.push(backHref)}
      >
        <ParticipantActivityListener onEvent={pushToast} />
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
