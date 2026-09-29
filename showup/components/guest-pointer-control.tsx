"use client";

import { useEffect, useRef, useState } from "react";
import { MousePointer2, Pencil, ZoomIn } from "lucide-react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { loadHandLandmarker } from "@/lib/presenter-overlay/compositor";
import { GestureTracker, type GestureAction } from "@/lib/presenter-overlay/gestures";
import {
  DRAW_TOPIC,
  POINTER_TOPIC,
  PointerSender,
  ZOOM_TOPIC,
  encodePointerMessage,
  parseDrawToGuest,
  parsePointerToGuest,
  parseZoomToGuest,
  type DrawPosition,
  type GuestAbility,
  type PointerPosition,
  type PointerStatus,
  type ZoomToHost,
} from "@/lib/presenter-overlay/guest-pointer";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/livekit-control-styles";

const PRESENTER_POLL_MS = 1_000;
/** How often the guest's own camera is checked for a pointing hand (~14 a second). */
const DETECT_INTERVAL_MS = 70;
/** A little slack past the host's own request timeout so their answer normally arrives first. */
const ASK_TIMEOUT_MS = 35_000;

const TOPICS: Record<GuestAbility, string> = { pointer: POINTER_TOPIC, draw: DRAW_TOPIC, zoom: ZOOM_TOPIC };

type ByAbility<T> = Record<GuestAbility, T>;

/**
 * The guest's side of the laser pointer, the pen, and pinch-zoom. While the presenter has this guest's ghost on the
 * share and allows it, it offers "Use pointer", "Use pen" and/or "Use zoom". When one is on, the hand tracking runs
 * here, on the guest's own camera, and only a fingertip/pinch position and an on/off or gesture flag are sent (to
 * the presenter alone); no video or hand landmarks leave this device. The presenter's screen does the drawing and
 * zooming. Point with the index finger for the pointer, hold two fingers together for the pen, pinch thumb and
 * index together to zoom (move the pinched hand to pan, open the palm and hold to reset). Shows nothing while
 * there's no share, when this guest isn't allowed anything, or where the hand model can't run. Guests still have
 * no spotlight or reactions: nothing here can send them.
 */
export function GuestPointerControl({ room }: { room: Room | null }) {
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const [selfSharing, setSelfSharing] = useState(false);
  const [status, setStatus] = useState<ByAbility<PointerStatus>>({ pointer: "off", draw: "off", zoom: "off" });
  const [using, setUsing] = useState<ByAbility<boolean>>({ pointer: false, draw: false, zoom: false });
  const [asked, setAsked] = useState<ByAbility<boolean>>({ pointer: false, draw: false, zoom: false });
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const presenterRef = useRef<string | null>(null);
  presenterRef.current = presenterId;
  const askTimers = useRef<ByAbility<ReturnType<typeof setTimeout> | null>>({ pointer: null, draw: null, zoom: null });
  // Read by the detection loop without restarting it whenever a toggle changes.
  const wantRef = useRef<ByAbility<boolean>>({ pointer: false, draw: false, zoom: false });
  wantRef.current = {
    pointer: using.pointer && status.pointer === "allowed",
    draw: using.draw && status.draw === "allowed",
    zoom: using.zoom && status.zoom === "allowed",
  };
  const anyWanted = wantRef.current.pointer || wantRef.current.draw || wantRef.current.zoom;

  function setOne<T>(setter: (update: (previous: ByAbility<T>) => ByAbility<T>) => void, ability: GuestAbility, value: T) {
    setter((previous) => (previous[ability] === value ? previous : { ...previous, [ability]: value }));
  }

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
      setStatus({ pointer: "off", draw: "off", zoom: "off" });
      setUsing({ pointer: false, draw: false, zoom: false });
      setAsked({ pointer: false, draw: false, zoom: false });
    }
  }, [presenterId]);

  // The presenter tells this guest where they stand; only the sharer's word counts.
  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) => {
      if (!participant || participant.identity !== presenterRef.current) return;
      const ability: GuestAbility | null = topic === POINTER_TOPIC ? "pointer" : topic === DRAW_TOPIC ? "draw" : topic === ZOOM_TOPIC ? "zoom" : null;
      if (!ability) return;
      const message = ability === "pointer" ? parsePointerToGuest(payload) : ability === "draw" ? parseDrawToGuest(payload) : parseZoomToGuest(payload);
      if (!message) return;
      setOne(setStatus, ability, message.status);
      if (message.status !== "pending") {
        setOne(setAsked, ability, false);
        const timer = askTimers.current[ability];
        if (timer) clearTimeout(timer);
      }
      if (message.status !== "allowed") setOne(setUsing, ability, false);
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  useEffect(
    () => () => {
      for (const timer of Object.values(askTimers.current)) if (timer) clearTimeout(timer);
    },
    [],
  );

  // The detection loop: only while the guest has turned the pointer, the pen or zoom on and is allowed it. One loop serves all three.
  useEffect(() => {
    if (!room || !anyWanted || !presenterId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let video: HTMLVideoElement | null = null;
    const senders = { pointer: new PointerSender(), draw: new PointerSender() };
    const tracker = new GestureTracker();

    function send(ability: "pointer" | "draw", position: PointerPosition) {
      // Positions are lossy on purpose (a late one is worthless); the closing "off" is reliable.
      const message: PointerPosition | DrawPosition = ability === "pointer" ? position : { ...position, t: "draw" };
      room?.localParticipant
        .publishData(encodePointerMessage(message), { reliable: !message.on, topic: TOPICS[ability], destinationIdentities: [presenterId as string] })
        .catch(() => {});
    }

    // Zoom has no PointerSender: zoom/pan actions already come out of the tracker paced to one per detection tick
    // (~14/s), and reset fires once per palm-hold — there's no continuous position to throttle, and no dot whose
    // ending needs a reliable "off" the way a pointer or pen has.
    function sendZoom(action: Extract<GestureAction, { type: "zoom" | "pan" | "reset" }>) {
      // Clamped and rounded like PointerSender's positions, so a landmark that reads fractionally outside 0-1
      // (the frame-edge check only guards the other three sides — see gestures.ts's EDGE comment) still parses.
      const clamp = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
      const message: ZoomToHost =
        action.type === "reset" ? { t: "zoom", action: "reset" } : { t: "zoom", action: action.type, u: clamp(action.u), v: clamp(action.v) };
      room?.localParticipant
        .publishData(encodePointerMessage(message), { reliable: action.type !== "pan", topic: TOPICS.zoom, destinationIdentities: [presenterId as string] })
        .catch(() => {});
    }

    (async () => {
      try {
        const hand = await loadHandLandmarker();
        if (cancelled) return;
        const camera = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
        if (!camera) {
          setNotice("Turn your camera on to use the pointer, pen or zoom.");
          setUsing({ pointer: false, draw: false, zoom: false });
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
            const want = wantRef.current;
            // The pointer needs the pointing pose, the pen the two-fingers-together pose; a turned-off one sends its closing "off" once.
            const tip = want.pointer && state.pointer && state.pointer.fade >= 0.999 ? { u: state.pointer.u, v: state.pointer.v } : null;
            const pen = want.draw && state.pen ? { u: state.pen.u, v: state.pen.v } : null;
            const pointerMessage = senders.pointer.next(now, tip);
            if (pointerMessage) send("pointer", pointerMessage);
            const drawMessage = senders.draw.next(now, pen);
            if (drawMessage) send("draw", drawMessage);
            // Zoom (pinch), pan (the pinch held and moved) and reset (open palm) come straight from the same tracker.
            if (want.zoom) {
              for (const action of state.actions) {
                if (action.type === "zoom" || action.type === "pan" || action.type === "reset") sendZoom(action);
              }
            }
          } catch {
            // A bad frame is skipped; the loop keeps going.
          }
        }, DETECT_INTERVAL_MS);
      } catch (error) {
        console.warn("[guest-pointer] hand tracking can't run here", error);
        if (!cancelled) {
          setUnavailable(true);
          setUsing({ pointer: false, draw: false, zoom: false });
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
      for (const ability of ["pointer", "draw"] as const) {
        const off = senders[ability].next(performance.now(), null);
        if (off) send(ability, off);
      }
    };
  }, [room, anyWanted, presenterId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  function ask(ability: GuestAbility) {
    if (!room || !presenterId) return;
    const t = ability === "pointer" ? "pointer-request" : ability === "draw" ? "draw-request" : "zoom-request";
    room.localParticipant
      .publishData(encodePointerMessage({ t }), {
        reliable: true,
        topic: TOPICS[ability],
        destinationIdentities: [presenterId],
      })
      .catch(() => {});
    setOne(setAsked, ability, true);
    const previous = askTimers.current[ability];
    if (previous) clearTimeout(previous);
    askTimers.current[ability] = setTimeout(() => {
      setOne(setAsked, ability, false);
      setNotice("No response from the presenter.");
    }, ASK_TIMEOUT_MS);
  }

  if (unavailable || !presenterId || selfSharing || (status.pointer === "off" && status.draw === "off" && status.zoom === "off" && !notice)) return null;

  const labels: ByAbility<{ ask: string; use: string; stop: string; askTitle: string; useTitle: string; hint: string }> = {
    pointer: {
      ask: "Ask to use pointer",
      use: "Use pointer",
      stop: "Stop pointer",
      askTitle: "Ask the presenter to let you point at the shared screen",
      useTitle: "Point with your index finger, other fingers curled, to show a dot on the shared screen",
      hint: "Point with your index finger, other fingers curled, and hold for a moment.",
    },
    draw: {
      ask: "Ask to draw",
      use: "Use pen",
      stop: "Stop pen",
      askTitle: "Ask the presenter to let you draw on the shared screen",
      useTitle: "Hold two fingers together to draw on the shared screen",
      hint: "Hold two fingers together and move them to draw.",
    },
    zoom: {
      ask: "Ask to zoom",
      use: "Use zoom",
      stop: "Stop zoom",
      askTitle: "Ask the presenter to let you zoom and pan the shared screen",
      useTitle: "Pinch thumb and index finger together to zoom, then move your pinched hand to pan",
      hint: "Pinch thumb and index together and hold to zoom in, move your pinched hand to pan, and hold an open palm still to reset.",
    },
  };

  return (
    <div className="pointer-events-auto flex max-w-[18rem] flex-col items-start gap-2" data-testid="guest-pointer-control">
      {(["pointer", "draw", "zoom"] as const).map((ability) => {
        const Icon = ability === "pointer" ? MousePointer2 : ability === "draw" ? Pencil : ZoomIn;
        const text = labels[ability];
        const current = status[ability];
        return (
          <div key={ability} className="flex flex-col items-start gap-2" data-testid={`guest-${ability}-control`}>
            {current === "ask" && (
              <button type="button" onClick={() => ask(ability)} disabled={asked[ability]} className={LK_BUTTON_CLASS} title={text.askTitle}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{asked[ability] ? "Waiting for the presenter…" : text.ask}</span>
              </button>
            )}
            {current === "pending" && (
              <button type="button" disabled className={LK_BUTTON_CLASS}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">Waiting for the presenter…</span>
              </button>
            )}
            {current === "allowed" && (
              <button
                type="button"
                onClick={() => setUsing((previous) => ({ ...previous, [ability]: !previous[ability] }))}
                aria-pressed={using[ability]}
                className={`${LK_BUTTON_CLASS} ${using[ability] ? LK_BUTTON_ACTIVE_CLASS : ""}`}
                title={text.useTitle}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{using[ability] ? text.stop : text.use}</span>
              </button>
            )}
            {current === "allowed" && using[ability] && (
              <p role="status" className={`rounded-md border px-2 py-1 text-xs ${LK_PANEL_CLASS}`}>
                {text.hint}
              </p>
            )}
          </div>
        );
      })}
      {notice && (
        <p role="status" className={`rounded-md border px-2 py-1 text-xs ${LK_PANEL_CLASS}`}>
          {notice}
        </p>
      )}
    </div>
  );
}
