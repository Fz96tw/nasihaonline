"use client";

import { useEffect, useRef, useState } from "react";
import { MousePointer2 } from "lucide-react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { loadHandLandmarker } from "@/lib/presenter-overlay/compositor";
import { GestureTracker } from "@/lib/presenter-overlay/gestures";
import {
  POINTER_TOPIC,
  PointerSender,
  encodePointerMessage,
  parsePointerToGuest,
  type PointerStatus,
  type PointerPosition,
} from "@/lib/presenter-overlay/guest-pointer";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/livekit-control-styles";

const PRESENTER_POLL_MS = 1_000;
/** How often the guest's own camera is checked for a pointing hand (~14 a second). */
const DETECT_INTERVAL_MS = 70;
/** A little slack past the host's own request timeout so their answer normally arrives first. */
const ASK_TIMEOUT_MS = 35_000;

/**
 * The guest's side of the laser pointer. While the presenter has this guest's ghost on the share and allows pointing,
 * it offers "Use pointer". When it's on, the hand tracking runs here, on the guest's own camera, and only the fingertip
 * position and an on/off flag are sent (to the presenter alone); no video or hand landmarks leave this device. The
 * presenter's screen does the drawing. Shows nothing while there's no share, when this guest isn't allowed to point, or
 * where the hand model can't run.
 */
export function GuestPointerControl({ room }: { room: Room | null }) {
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const [selfSharing, setSelfSharing] = useState(false);
  const [status, setStatus] = useState<PointerStatus>("off");
  const [using, setUsing] = useState(false);
  const [asked, setAsked] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const presenterRef = useRef<string | null>(null);
  presenterRef.current = presenterId;
  const askTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hidden where the hand model can't run at all.
  useEffect(() => {
    if (typeof WebAssembly === "undefined" || !navigator.mediaDevices?.getUserMedia) setUnavailable(true);
  }, []);

  // Who, if anyone, is sharing. Polled, like the overlay control: cheap, and a missed event can't leave a stale button.
  useEffect(() => {
    if (!room) return;
    function poll() {
      if (!room) return;
      let found: string | null = null;
      room.remoteParticipants.forEach((participant) => {
        if (!found && participant.getTrackPublication(Track.Source.ScreenShare)) found = participant.identity;
      });
      setPresenterId((previous) => (previous === found ? previous : found));
      setSelfSharing(room.localParticipant.isScreenShareEnabled);
    }
    poll();
    const timer = setInterval(poll, PRESENTER_POLL_MS);
    return () => clearInterval(timer);
  }, [room]);

  // The share ended: nothing from it carries over.
  useEffect(() => {
    if (!presenterId) {
      setStatus("off");
      setUsing(false);
      setAsked(false);
    }
  }, [presenterId]);

  // The presenter tells this guest where they stand; only the sharer's word counts.
  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) => {
      if (topic !== POINTER_TOPIC || !participant || participant.identity !== presenterRef.current) return;
      const message = parsePointerToGuest(payload);
      if (!message) return;
      setStatus(message.status);
      if (message.status !== "pending") {
        setAsked(false);
        if (askTimer.current) clearTimeout(askTimer.current);
      }
      if (message.status !== "allowed") setUsing(false);
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  useEffect(
    () => () => {
      if (askTimer.current) clearTimeout(askTimer.current);
    },
    [],
  );

  // The detection loop: only while the guest has turned the pointer on and is allowed to point.
  useEffect(() => {
    if (!room || !using || status !== "allowed" || !presenterId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let video: HTMLVideoElement | null = null;
    const sender = new PointerSender();
    const tracker = new GestureTracker();

    function send(message: PointerPosition) {
      // Positions are lossy on purpose (a late one is worthless); the closing "off" is reliable.
      room?.localParticipant
        .publishData(encodePointerMessage(message), { reliable: !message.on, topic: POINTER_TOPIC, destinationIdentities: [presenterId as string] })
        .catch(() => {});
    }

    (async () => {
      try {
        const hand = await loadHandLandmarker();
        if (cancelled) return;
        const camera = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
        if (!camera) {
          setNotice("Turn your camera on to use the pointer.");
          setUsing(false);
          return;
        }
        const element = document.createElement("video");
        element.muted = true;
        element.playsInline = true;
        element.srcObject = new MediaStream([camera]);
        // Kept in the page, invisible: some browsers won't decode a detached video.
        Object.assign(element.style, { position: "fixed", width: "1px", height: "1px", opacity: "0", pointerEvents: "none", left: "0", top: "0" });
        document.body.appendChild(element);
        video = element;
        await element.play();
        if (cancelled) return;
        timer = setInterval(() => {
          if (!video || video.readyState < 2 || !video.videoWidth) return;
          try {
            const now = performance.now();
            const result = hand.detectForVideo(video, now);
            const state = tracker.update(now, result.landmarks?.[0] ?? null, video.videoWidth / video.videoHeight);
            const tip = state.pointer && state.pointer.fade >= 0.999 ? { u: state.pointer.u, v: state.pointer.v } : null;
            const message = sender.next(now, tip);
            if (message) send(message);
          } catch {
            // A bad frame is skipped; the loop keeps going.
          }
        }, DETECT_INTERVAL_MS);
      } catch (error) {
        console.warn("[guest-pointer] hand tracking can't run here", error);
        if (!cancelled) {
          setUnavailable(true);
          setUsing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (video) {
        video.pause();
        video.srcObject = null;
        video.remove();
      }
      const off = sender.next(performance.now(), null);
      if (off) send(off);
    };
  }, [room, using, status, presenterId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  function ask() {
    if (!room || !presenterId) return;
    room.localParticipant
      .publishData(encodePointerMessage({ t: "pointer-request" }), { reliable: true, topic: POINTER_TOPIC, destinationIdentities: [presenterId] })
      .catch(() => {});
    setAsked(true);
    if (askTimer.current) clearTimeout(askTimer.current);
    askTimer.current = setTimeout(() => {
      setAsked(false);
      setNotice("No response from the presenter.");
    }, ASK_TIMEOUT_MS);
  }

  if (unavailable || !presenterId || selfSharing || (status === "off" && !notice)) return null;

  return (
    <div className="pointer-events-auto flex max-w-[18rem] flex-col items-start gap-2" data-testid="guest-pointer-control">
      {status === "ask" && (
        <button type="button" onClick={ask} disabled={asked} className={LK_BUTTON_CLASS} title="Ask the presenter to let you point at the shared screen">
          <MousePointer2 className="h-4 w-4" />
          <span className="hidden sm:inline">{asked ? "Waiting for the presenter…" : "Ask to use pointer"}</span>
        </button>
      )}
      {status === "pending" && (
        <button type="button" disabled className={LK_BUTTON_CLASS}>
          <MousePointer2 className="h-4 w-4" />
          <span className="hidden sm:inline">Waiting for the presenter…</span>
        </button>
      )}
      {status === "allowed" && (
        <button
          type="button"
          onClick={() => setUsing((value) => !value)}
          aria-pressed={using}
          className={`${LK_BUTTON_CLASS} ${using ? LK_BUTTON_ACTIVE_CLASS : ""}`}
          title="Point with your index finger, other fingers curled, to show a dot on the shared screen"
        >
          <MousePointer2 className="h-4 w-4" />
          <span className="hidden sm:inline">{using ? "Stop pointer" : "Use pointer"}</span>
        </button>
      )}
      {status === "allowed" && using && (
        <p role="status" className={`rounded-md border px-2 py-1 text-xs ${LK_PANEL_CLASS}`}>
          Point with your index finger, other fingers curled, and hold for a moment.
        </p>
      )}
      {notice && (
        <p role="status" className={`rounded-md border px-2 py-1 text-xs ${LK_PANEL_CLASS}`}>
          {notice}
        </p>
      )}
    </div>
  );
}
