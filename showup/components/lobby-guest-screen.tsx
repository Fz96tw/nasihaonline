"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { ConnectionState, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { LiveKitRoom, VideoTrack, useConnectionState, useLocalParticipant, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { LOBBY_TOPIC, type LobbyMessage, type RoomCredentials } from "@/lib/room-types";

/** Fallback for a missed data message: ask the server directly. */
const POLL_INTERVAL_MS = 3000;

type Props = {
  credentials: RoomCredentials;
  /** The host approved: hand over the main-room credentials (consumed exactly once server-side). */
  onAdmitted: (credentials: RoomCredentials) => void;
  /** Rejected, expired or cancelled: back to the landing page. */
  onLeave: () => void;
};

type Outcome = "waiting" | "rejected";

/**
 * What a guest sees while the host's lobby is on. They hold a lobby token
 * only: it lets them publish their camera to the lobby room and nothing else,
 * so they can't see or hear the meeting. Approval arrives as a server-sent
 * data message (instant) and via polling /api/rooms/lobby/redeem (fallback);
 * redeeming swaps the lobby token for a main-room one.
 */
export function LobbyGuestScreen(props: Props) {
  return (
    <LiveKitRoom
      token={props.credentials.token}
      serverUrl={props.credentials.serverUrl}
      connect
      audio={false}
      video={false}
      className="min-h-screen"
    >
      <LobbyGuestInner {...props} />
    </LiveKitRoom>
  );
}

function LobbyGuestInner({ credentials, onAdmitted, onLeave }: Props) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { localParticipant, cameraTrack, isCameraEnabled } = useLocalParticipant();
  const [outcome, setOutcome] = useState<Outcome>("waiting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const redeeming = useRef(false);
  const finished = useRef(false);

  const redeem = useCallback(async () => {
    if (redeeming.current || finished.current) return;
    redeeming.current = true;
    try {
      const res = await fetch("/api/rooms/lobby/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: credentials.code,
          identity: credentials.identity,
          lobbySecret: credentials.lobbySecret,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (res.status === 404) {
        finished.current = true;
        setNotice(typeof payload?.error === "string" ? payload.error : "This request has expired.");
        setOutcome("rejected");
        return;
      }
      if (!res.ok) return; // 429/503: keep polling.
      if (payload?.status === "rejected") {
        finished.current = true;
        setOutcome("rejected");
      } else if (payload?.status === "approved" && payload.credentials) {
        finished.current = true;
        onAdmitted(payload.credentials as RoomCredentials);
      } else if (payload?.status === "full") {
        setNotice("You're approved, but the meeting is full right now. Waiting for a spot…");
      }
    } catch {
      // Network blip: the next poll retries.
    } finally {
      redeeming.current = false;
    }
  }, [credentials.code, credentials.identity, credentials.lobbySecret, onAdmitted]);

  useEffect(() => {
    if (outcome !== "waiting") return;
    const timer = setInterval(redeem, POLL_INTERVAL_MS);
    void redeem();
    return () => clearInterval(timer);
  }, [outcome, redeem]);

  useEffect(() => {
    function onData(payload: Uint8Array, _participant?: RemoteParticipant, _kind?: unknown, topic?: string) {
      if (topic !== LOBBY_TOPIC) return;
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as LobbyMessage;
        if (message.type === "approved" || message.type === "rejected") void redeem();
      } catch {
        // Not ours.
      }
    }
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, redeem]);

  const enableCamera = useCallback(async () => {
    setCameraError(null);
    try {
      await localParticipant.setCameraEnabled(true);
    } catch {
      setCameraError("Couldn't turn on your webcam. Check your browser's camera permission, or wait without it: the host will see just your name.");
    }
  }, [localParticipant]);

  // The prompt below is the user-facing ask; also try right away so it's one click fewer where the browser allows it.
  useEffect(() => {
    if (connection === ConnectionState.Connected && outcome === "waiting") void enableCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  // Rejection ends the wait: leave the lobby room and drop back to the landing page.
  useEffect(() => {
    if (outcome !== "rejected") return;
    void room.disconnect();
  }, [outcome, room]);

  if (outcome === "rejected") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-lg font-semibold">{notice ?? "The host declined your request to join."}</p>
          <button
            type="button"
            onClick={onLeave}
            className="mt-4 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Back to Showup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-muted/40 p-6 text-center">
        <p className="flex items-center justify-center gap-2 text-lg font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the host to let you in
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Turn on your webcam so the host can see who&apos;s asking to join. Only the host sees it, and you can&apos;t see or hear
          the meeting until you&apos;re approved.
        </p>
        <div className="mx-auto mt-4 aspect-video w-full max-w-xs overflow-hidden rounded-lg bg-black">
          {isCameraEnabled && cameraTrack ? (
            <VideoTrack
              trackRef={{ participant: localParticipant, publication: cameraTrack, source: Track.Source.Camera }}
              className="h-full w-full object-cover [transform:scaleX(-1)]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/60">Webcam off</div>
          )}
        </div>
        {!isCameraEnabled && (
          <button
            type="button"
            onClick={enableCamera}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Camera className="h-4 w-4" /> Turn on webcam
          </button>
        )}
        {cameraError && <p className="mt-2 text-xs text-muted-foreground">{cameraError}</p>}
        {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}
        <button type="button" onClick={onLeave} className="mt-5 text-sm text-muted-foreground underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
