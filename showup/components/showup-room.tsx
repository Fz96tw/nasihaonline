"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, Copy, MonitorUp, X } from "lucide-react";
import { RoomEvent, VideoPreset, VideoPresets, type RemoteParticipant, type Room } from "livekit-client";
import { LiveKitRoom, VideoConference, useLocalParticipant, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { PresenterOverlayControl } from "@/components/presenter-overlay-control";
import { LK_BUTTON_CLASS } from "@/components/livekit-control-styles";
import { isPresenterOverlaySupported } from "@/lib/presenter-overlay/compositor";
import type { RoomCredentials } from "@/lib/room-types";

/**
 * Chrome/Edge-only `getDisplayMedia()` extension
 * (https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia#selfbrowsersurface)
 * not yet in TS's DOM lib.
 */
type DisplayMediaStreamOptionsWithSelfBrowserSurface = DisplayMediaStreamOptions & {
  selfBrowserSurface?: "include" | "exclude";
};

/**
 * Webcam is shown small, so LiveKit's 720p/3-simulcast-layer default is wasted
 * work: capture at 480p with a single simulcast layer. Screen share keeps its
 * own (larger) default resolution.
 */
const WEBCAM_480P = new VideoPreset(854, 480, 600_000, 20);
const ROOM_OPTIONS = {
  videoCaptureDefaults: { resolution: WEBCAM_480P.resolution },
  publishDefaults: { videoSimulcastLayers: [VideoPresets.h180] },
};

/**
 * The prefab ControlBar's screen-share button calls `getDisplayMedia()` with no
 * way to pass capture options, so patch the browser API for the lifetime of the
 * meeting screen to default `selfBrowserSurface: "exclude"`. Without it, sharing
 * this meeting's own tab (or a window/monitor showing it) recurses the meeting
 * UI into the shared video. A no-op where the API doesn't exist (iOS Safari has
 * no screen-share API at all).
 */
function usePreventScreenShareSelfMirror() {
  useEffect(() => {
    const { mediaDevices } = navigator;
    if (!mediaDevices?.getDisplayMedia) return;
    const original = mediaDevices.getDisplayMedia.bind(mediaDevices);
    mediaDevices.getDisplayMedia = (options?: DisplayMediaStreamOptionsWithSelfBrowserSurface) =>
      original({ selfBrowserSurface: "exclude", ...options });
    return () => {
      mediaDevices.getDisplayMedia = original;
    };
  }, []);
}

const TOAST_DURATION_MS = 5_000;

type Toast = { id: string; message: string };

/**
 * Reports remote join/leave events up so the toast stack can live outside
 * <LiveKitRoom>'s own DOM tree (overlays nested inside it risk losing to its
 * internal layout and stacking). `ParticipantConnected/Disconnected` only fire
 * for remote participants, which is right: nobody needs to be told they joined.
 */
function ParticipantActivityListener({ onEvent }: { onEvent: (message: string) => void }) {
  const room = useRoomContext();

  useEffect(() => {
    function onConnected(participant: RemoteParticipant) {
      onEvent(`${participant.name || "Someone"} joined`);
    }
    function onDisconnected(participant: RemoteParticipant) {
      onEvent(`${participant.name || "Someone"} left`);
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

/** Hands the connected Room and the local screen-share state to the parent, which renders outside <LiveKitRoom>. */
function RoomBridge({ onRoom, onSharing }: { onRoom: (room: Room) => void; onSharing: (sharing: boolean) => void }) {
  const room = useRoomContext();
  const { isScreenShareEnabled } = useLocalParticipant();

  useEffect(() => {
    onRoom(room);
  }, [room, onRoom]);

  useEffect(() => {
    onSharing(isScreenShareEnabled);
  }, [isScreenShareEnabled, onSharing]);

  return null;
}

function TopLeftOverlay({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute left-4 top-4 z-50 flex flex-col items-start gap-2">{children}</div>;
}

/** Code and role banner. The host can copy the code to hand to the people who should join. */
function MeetingBanner({ code, isHost }: { code: string; isHost: boolean }) {
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!visible) return null;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is still shown on screen.
    }
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center p-2">
      <div className="pointer-events-auto relative rounded-md border bg-background/95 px-4 py-2 pr-8 text-center shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="absolute right-1.5 top-1.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <p className="text-[.6rem] font-black uppercase leading-none tracking-[.1em] text-muted-foreground">Showup</p>
        <p className="mt-1 flex items-center justify-center gap-2 font-semibold">
          <span>Code: {code}</span>
          {isHost && (
            <button
              type="button"
              onClick={copyCode}
              aria-label="Copy code"
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {isHost ? "You're hosting. Give this code to whoever should join." : "You joined this share."}
        </p>
      </div>
    </div>
  );
}

/**
 * Centered prompt shown to the host until their screen share is live. The
 * click is what supplies the user gesture `getDisplayMedia()` requires: by the
 * time the room has connected, the gesture from the landing page's Start
 * button has long expired, so auto-opening the picker would be blocked.
 */
function SharePrompt({ room, onError }: { room: Room | null; onError: (message: string) => void }) {
  const [pending, setPending] = useState(false);

  async function startSharing() {
    if (!room) return;
    setPending(true);
    try {
      await room.localParticipant.setScreenShareEnabled(true);
    } catch {
      onError("Screen share was cancelled. Choose a screen or window to start.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
      <div className="pointer-events-auto w-full max-w-sm rounded-lg border bg-background p-5 text-center shadow-lg">
        <MonitorUp className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="font-semibold">Choose a screen or window to share</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Guests who join with your code will see what you share. Turn on your camera from the bar below to add the
          webcam overlay.
        </p>
        <button
          type="button"
          onClick={startSharing}
          disabled={!room || pending}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <MonitorUp className="h-4 w-4" />
          {pending ? "Waiting for your choice…" : "Share your screen"}
        </button>
      </div>
    </div>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
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
 * Full-viewport LiveKit call. The banner, share prompt and toast stack are
 * absolutely-positioned siblings layered over <LiveKitRoom> (not children of it)
 * for the stacking reason noted on ParticipantActivityListener.
 *
 * `role` comes from the token the server minted, not from anything the client
 * chooses, so a guest can't unlock the host prompt by editing local state.
 */
export function ShowupRoom({ credentials, onLeave }: { credentials: RoomCredentials; onLeave: () => void }) {
  const isHost = credentials.role === "host";
  const [room, setRoom] = useState<Room | null>(null);
  const [sharing, setSharing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [overlaySupported, setOverlaySupported] = useState(true);

  usePreventScreenShareSelfMirror();

  useEffect(() => {
    setOverlaySupported(isPresenterOverlaySupported());
  }, []);

  const pushToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), TOAST_DURATION_MS);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-background">
      <MeetingBanner code={credentials.code} isHost={isHost} />
      {isHost && !sharing && <SharePrompt room={room} onError={pushToast} />}
      <Toasts toasts={toasts} />
      <TopLeftOverlay>
        {/* Anyone who shares can use the overlay: the control renders nothing until the local participant is sharing. */}
        {overlaySupported ? (
          <PresenterOverlayControl room={room} onError={pushToast} />
        ) : (
          isHost && (
            <div className={`pointer-events-auto max-w-[16rem] rounded-lg text-xs ${LK_BUTTON_CLASS}`}>
              The webcam overlay needs Chrome or Edge on a computer.
            </div>
          )
        )}
      </TopLeftOverlay>
      <LiveKitRoom
        token={credentials.token}
        serverUrl={credentials.serverUrl}
        connect
        options={ROOM_OPTIONS}
        data-lk-theme="default"
        style={{ height: "100%" }}
        onDisconnected={onLeave}
      >
        <ParticipantActivityListener onEvent={pushToast} />
        <RoomBridge onRoom={setRoom} onSharing={setSharing} />
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
