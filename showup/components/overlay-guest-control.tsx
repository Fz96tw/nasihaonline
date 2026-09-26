"use client";

import { useEffect, useRef, useState } from "react";
import { UserPlus, UserMinus } from "lucide-react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { REQUEST_TIMEOUT_MS, type GuestOverlayState } from "@/lib/presenter-overlay/co-ghosts";
import { OVERLAY_TOPIC, encodeMessage, parseToGuest, type ToPresenter } from "@/lib/presenter-overlay/overlay-protocol";
import { LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/livekit-control-styles";

/** How a refusal or lapse is worded to the guest. */
const NOTICES: Partial<Record<GuestOverlayState, string>> = {
  full: "Overlay is full.",
  declined: "The presenter said no.",
  closed: "The presenter isn't taking requests right now.",
  unavailable: "The presenter hasn't turned the camera overlay on.",
  timeout: "No response from the presenter.",
};

/** A little slack past the presenter's own timeout, so their "no response" message normally arrives first. */
const LOCAL_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 5_000;
const PRESENTER_POLL_MS = 1_000;

/**
 * The guest's side of the presenter overlay: a button to ask to appear on
 * the shared screen, the presenter's invite (which must be allowed before
 * anything is shown), and a "Remove me" button while on it. It shows only
 * the guest's own state; the presenter's settings and controls live in
 * PresenterOverlayControl, which only the person sharing gets.
 *
 * Renders nothing unless someone else is sharing. Messages count only when
 * they come from that person, and they're addressed to this guest alone.
 */
export function OverlayGuestControl({ room }: { room: Room | null }) {
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const [selfSharing, setSelfSharing] = useState(false);
  const [onOverlay, setOnOverlay] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [invited, setInvited] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const presenterRef = useRef<string | null>(null);
  presenterRef.current = presenterId;
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer(timer: { current: ReturnType<typeof setTimeout> | null }) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function showNotice(message: string | null) {
    clearTimer(noticeTimer);
    setNotice(message);
    if (message) noticeTimer.current = setTimeout(() => setNotice(null), 6_000);
  }

  function reset() {
    clearTimer(waitTimer);
    clearTimer(inviteTimer);
    setWaiting(false);
    setInvited(false);
    setOnOverlay(false);
  }

  function send(message: ToPresenter) {
    const target = presenterRef.current;
    if (!room || !target) return;
    room.localParticipant
      .publishData(encodeMessage(message), { reliable: true, topic: OVERLAY_TOPIC, destinationIdentities: [target] })
      .catch(() => {});
  }

  // Who, if anyone, is sharing. Polled: cheap, and a missed event can't leave a stale button.
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

  // The presenter stopped sharing (or left): whatever we had with them is over.
  useEffect(() => {
    if (!presenterId) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenterId]);

  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) => {
      if (topic !== OVERLAY_TOPIC || !participant || participant.identity !== presenterRef.current) return;
      const message = parseToGuest(payload);
      if (!message) return;
      if (message.t === "overlay-request") {
        setInvited(true);
        clearTimer(inviteTimer);
        inviteTimer.current = setTimeout(() => setInvited(false), REQUEST_TIMEOUT_MS);
        return;
      }
      clearTimer(waitTimer);
      setWaiting(message.state === "pending");
      if (message.state === "pending") {
        waitTimer.current = setTimeout(() => {
          setWaiting(false);
          showNotice(NOTICES.timeout ?? null);
        }, LOCAL_TIMEOUT_MS);
      }
      setOnOverlay(message.state === "on");
      if (message.state === "on" || message.state === "off") {
        clearTimer(inviteTimer);
        setInvited(false);
      }
      showNotice(NOTICES[message.state] ?? null);
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(
    () => () => {
      clearTimer(waitTimer);
      clearTimer(inviteTimer);
      clearTimer(noticeTimer);
    },
    [],
  );

  /** A ghost is cut out of the guest's camera, so it has to be on before they can appear. */
  async function ensureCamera(): Promise<boolean> {
    if (!room) return false;
    if (room.localParticipant.isCameraEnabled) return true;
    try {
      await room.localParticipant.setCameraEnabled(true);
      return true;
    } catch {
      showNotice("Couldn't turn on your camera.");
      return false;
    }
  }

  async function ask() {
    showNotice(null);
    if (!(await ensureCamera())) return;
    send({ t: "overlay-join-request" });
    setWaiting(true);
    clearTimer(waitTimer);
    waitTimer.current = setTimeout(() => {
      setWaiting(false);
      showNotice(NOTICES.timeout ?? null);
    }, LOCAL_TIMEOUT_MS);
  }

  async function answerInvite(accept: boolean) {
    clearTimer(inviteTimer);
    setInvited(false);
    if (!accept) {
      send({ t: "overlay-response", accept: false });
      return;
    }
    if (!(await ensureCamera())) {
      send({ t: "overlay-response", accept: false });
      return;
    }
    send({ t: "overlay-response", accept: true });
  }

  function leave() {
    send({ t: "overlay-leave" });
    reset();
  }

  if (!presenterId || selfSharing) return null;

  return (
    <div className="pointer-events-auto flex max-w-[18rem] flex-col items-start gap-2">
      {invited && (
        <div role="alertdialog" aria-label="Presenter invitation" className={`w-full space-y-2 rounded-lg border p-3 text-sm shadow-lg ${LK_PANEL_CLASS}`}>
          <p className="text-white">The presenter would like you to appear on the shared screen. Your camera will be shown as a see-through cut-out.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => answerInvite(true)} className={`${LK_BUTTON_CLASS} flex-1 justify-center`}>
              Allow
            </button>
            <button type="button" onClick={() => answerInvite(false)} className={`${LK_BUTTON_CLASS} flex-1 justify-center`}>
              Decline
            </button>
          </div>
        </div>
      )}
      {onOverlay ? (
        <button type="button" onClick={leave} className={LK_BUTTON_CLASS} title="Take yourself off the shared screen">
          <UserMinus className="h-4 w-4" />
          <span className="hidden sm:inline">Remove me from overlay</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={ask}
          disabled={waiting}
          className={LK_BUTTON_CLASS}
          title="Ask the presenter to show you on the shared screen"
        >
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">{waiting ? "Waiting for the presenter…" : "Appear on the shared screen"}</span>
        </button>
      )}
      {notice && (
        <p role="status" className={`rounded-md border px-2 py-1 text-xs ${LK_PANEL_CLASS}`}>
          {notice}
        </p>
      )}
    </div>
  );
}
