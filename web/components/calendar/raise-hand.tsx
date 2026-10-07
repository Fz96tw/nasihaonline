"use client";

import { useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { RoomEvent, Track, type Participant, type Room } from "livekit-client";
import { ParticipantTile, useMaybeTrackRefContext, useParticipantAttribute } from "@livekit/components-react";
import { getCsrfToken } from "@/lib/csrf-client";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/calendar/livekit-control-styles";

/**
 * Raise hand (Nasiha Conference). The signal is two LiveKit participant
 * attributes a client sets on itself — no server state, no data-channel
 * message: LiveKit pushes ParticipantAttributesChanged to everyone, hands a
 * late joiner the current attributes of everyone already in the room, and
 * drops them when the participant disconnects. Needs the token's
 * `canUpdateOwnMetadata` grant (lib/livekit.ts mintLiveKitToken). Lowering
 * *someone else's* hand can't happen client-side, so the host/co-host button
 * goes through POST .../lower-hand.
 */
export const HAND_RAISED_ATTR = "handRaised";
export const HAND_RAISED_AT_ATTR = "handRaisedAt";

/** Ignore a toggle this soon after the last one — stops a held key or a double-click from spamming everyone's toasts/chime. */
const TOGGLE_DEBOUNCE_MS = 600;

export type RaisedHand = { identity: string; name: string; raisedAt: number; isLocal: boolean };

function readHand(participant: Participant): RaisedHand | null {
  if (participant.attributes?.[HAND_RAISED_ATTR] !== "1") return null;
  const raisedAt = Number(participant.attributes[HAND_RAISED_AT_ATTR]);
  return {
    identity: participant.identity,
    name: participant.name || participant.identity,
    raisedAt: Number.isFinite(raisedAt) ? raisedAt : 0,
    isLocal: participant.isLocal,
  };
}

function readHands(room: Room): RaisedHand[] {
  return [room.localParticipant, ...Array.from(room.remoteParticipants.values())]
    .map(readHand)
    .filter((hand): hand is RaisedHand => hand !== null)
    .sort((a, b) => a.raisedAt - b.raisedAt);
}

/**
 * Everyone currently holding a hand up, oldest first. `onNewHand` fires once
 * per hand that goes up *after* this mounts, and only for someone else —
 * hands already up when the hook starts (a host joining late) just show in
 * the list without re-announcing. Kept in a ref so the caller needn't memoize it.
 */
export function useRaisedHands(room: Room | null, onNewHand?: (hand: RaisedHand) => void): RaisedHand[] {
  const [hands, setHands] = useState<RaisedHand[]>([]);
  const onNewHandRef = useRef(onNewHand);
  onNewHandRef.current = onNewHand;

  useEffect(() => {
    if (!room) return;
    const seen = new Set<string>();
    let initial = true;

    function sync() {
      if (!room) return;
      const next = readHands(room);
      for (const hand of next) {
        if (!seen.has(hand.identity)) {
          seen.add(hand.identity);
          if (!initial && !hand.isLocal) onNewHandRef.current?.(hand);
        }
      }
      for (const identity of Array.from(seen)) {
        if (!next.some((hand) => hand.identity === identity)) seen.delete(identity);
      }
      setHands(next);
    }

    sync();
    initial = false;
    room.on(RoomEvent.ParticipantAttributesChanged, sync);
    room.on(RoomEvent.ParticipantConnected, sync);
    room.on(RoomEvent.ParticipantDisconnected, sync);
    room.on(RoomEvent.Connected, sync);
    return () => {
      room.off(RoomEvent.ParticipantAttributesChanged, sync);
      room.off(RoomEvent.ParticipantConnected, sync);
      room.off(RoomEvent.ParticipantDisconnected, sync);
      room.off(RoomEvent.Connected, sync);
    };
  }, [room]);

  return hands;
}

/** Short two-note chime for the host/co-host when a hand goes up. Best-effort: a browser that blocks audio just gets the toast. */
export function playHandChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [660, 880].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.15);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // Audio is a nicety, never an error.
  }
}

async function setOwnHand(room: Room, raised: boolean) {
  await room.localParticipant.setAttributes(
    raised
      ? { [HAND_RAISED_ATTR]: "1", [HAND_RAISED_AT_ATTR]: String(Date.now()) }
      : // An empty string deletes the attribute.
        { [HAND_RAISED_ATTR]: "", [HAND_RAISED_AT_ATTR]: "" },
  );
}

/** Raise/Lower toggle for the viewer's own hand — every participant, member or guest. Alt+H does the same from anywhere on the page. */
export function RaiseHandControl({
  room,
  raised,
  onError,
}: {
  room: Room | null;
  raised: boolean;
  onError: (message: string) => void;
}) {
  const lastToggle = useRef(0);
  const raisedRef = useRef(raised);
  raisedRef.current = raised;

  async function toggle() {
    if (!room) return;
    const now = Date.now();
    if (now - lastToggle.current < TOGGLE_DEBOUNCE_MS) return;
    lastToggle.current = now;
    try {
      await setOwnHand(room, !raisedRef.current);
    } catch (error) {
      console.error("[raise-hand] Failed to update own hand", error);
      onError("Couldn't update your hand. Try again.");
    }
  }

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== "KeyH") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      void toggleRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!room}
      aria-pressed={raised}
      aria-keyshortcuts="Alt+H"
      title="Alt+H"
      className={`pointer-events-auto ${LK_BUTTON_CLASS} ${raised ? LK_BUTTON_ACTIVE_CLASS : ""}`}
    >
      <Hand className={`h-4 w-4 ${raised ? "text-yellow-400" : ""}`} />
      <span className="hidden sm:inline">{raised ? "Lower hand" : "Raise hand"}</span>
    </button>
  );
}

/**
 * Host/co-host view of who's waiting to speak: a count pill (kept outside
 * LiveKit's own DOM, like every other overlay here, so it stays up during a
 * screen share) that opens an oldest-first list with a Lower button per
 * person. `announcement` goes into a polite live region so a screen reader
 * hears each new hand. Renders nothing unless the viewer is host/co-host and
 * at least one hand is up.
 */
export function RaisedHandsQueue({
  room,
  hands,
  announcement,
  lowerHandEndpoint,
  onError,
}: {
  room: Room | null;
  hands: RaisedHand[];
  announcement: string;
  lowerHandEndpoint: string;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  async function lower(hand: RaisedHand) {
    setPending(hand.identity);
    try {
      if (hand.isLocal) {
        if (room) await setOwnHand(room, false);
        return;
      }
      const csrfToken = await getCsrfToken();
      const res = await fetch(lowerHandEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ identity: hand.identity }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        onError(typeof payload?.error === "string" ? payload.error : "Couldn't lower that hand. Try again.");
      }
      // On success the list updates via ParticipantAttributesChanged, same as everyone else's view.
    } catch (error) {
      console.error("[raise-hand] Failed to lower hand", error);
      onError("Couldn't lower that hand. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {hands.length > 0 && (
        <div
          className="pointer-events-none absolute left-1/2 z-50 -translate-x-1/2"
          style={{ bottom: "calc(69px + 0.75rem)" }}
        >
          <div className="pointer-events-auto relative">
            {open && (
              <div className={`absolute bottom-full left-1/2 mb-2 max-h-72 w-64 -translate-x-1/2 overflow-y-auto rounded-lg border p-2 shadow-lg ${LK_PANEL_CLASS}`}>
                <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-white/50">Raised hands</p>
                <ol className="space-y-1">
                  {hands.map((hand) => (
                    <li key={hand.identity} className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-sm">
                      <span className="truncate">
                        {hand.name}
                        {hand.isLocal && <span className="text-white/50"> (You)</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => lower(hand)}
                        disabled={pending === hand.identity}
                        className="shrink-0 font-medium text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
                      >
                        Lower
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={`${hands.length} raised ${hands.length === 1 ? "hand" : "hands"}`}
              className={`${LK_BUTTON_CLASS} ${open ? LK_BUTTON_ACTIVE_CLASS : ""} shadow-lg`}
            >
              <Hand className="h-4 w-4 text-yellow-400" />
              <span>{hands.length}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const HAND_TILE_CLASS =
  "data-[hand-raised=true]:ring-2 data-[hand-raised=true]:ring-yellow-400 " +
  "data-[hand-raised=true]:after:absolute data-[hand-raised=true]:after:right-2 data-[hand-raised=true]:after:top-2 " +
  "data-[hand-raised=true]:after:z-10 data-[hand-raised=true]:after:rounded-full data-[hand-raised=true]:after:bg-black/70 " +
  "data-[hand-raised=true]:after:px-2 data-[hand-raised=true]:after:py-1 data-[hand-raised=true]:after:text-2xl " +
  "data-[hand-raised=true]:after:leading-none data-[hand-raised=true]:after:content-['✋']";

function HandTile({ participant, isCamera }: { participant: Participant; isCamera: boolean }) {
  const raised = useParticipantAttribute(HAND_RAISED_ATTR, { participant }) === "1";
  return <ParticipantTile data-hand-raised={raised && isCamera ? "true" : undefined} className={HAND_TILE_CLASS} />;
}

/**
 * Drop-in for `<ParticipantTile />` inside GridLayout/CarouselLayout (they
 * supply the per-track context this reads): same tile, plus a ✋ badge and
 * yellow ring on a camera tile whose participant has a hand up. The badge is
 * a CSS pseudo-element keyed off a data attribute because ParticipantTile's
 * children replace its default contents rather than add to them.
 */
export function HandAwareTile() {
  const trackRef = useMaybeTrackRefContext();
  if (!trackRef) return <ParticipantTile />;
  return <HandTile participant={trackRef.participant} isCamera={trackRef.source === Track.Source.Camera} />;
}
