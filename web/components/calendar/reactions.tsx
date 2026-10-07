"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { RoomEvent, type Participant, type Room } from "livekit-client";
import {
  MAX_FLOATING_REACTIONS,
  REACTIONS,
  REACTION_EMOJI_SIZE_CLASS,
  REACTION_FLOAT_MS,
  REACTION_MIN_INTERVAL_MS,
  REACTION_NAME_MAX_CHARS,
  REACTION_TOPIC,
  encodeReaction,
  parseReaction,
} from "@/lib/reactions";
import { LK_PANEL_CLASS } from "@/components/calendar/livekit-control-styles";

export type FloatingReaction = { id: string; emoji: string; name: string; left: number };

/** Random spot across the middle 80% of the width, so simultaneous reactions don't stack in one column. */
function randomLeft() {
  return 10 + Math.random() * 80;
}

/**
 * Receives and sends reactions. A reaction sits in `floats` for
 * REACTION_FLOAT_MS and is then removed. The name shown is read from
 * LiveKit's own sender (the `participant` argument), never from the message.
 * LiveKit doesn't echo a publish back to its sender, so `send` floats the
 * viewer's own reaction locally as "You". Both directions drop a reaction
 * that comes too soon after the same person's last one, and drop new ones
 * while MAX_FLOATING_REACTIONS are already up.
 */
export function useReactions(room: Room | null, enabled: boolean) {
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const lastFrom = useRef(new Map<string, number>());
  const lastSent = useRef(0);
  const countRef = useRef(0);
  countRef.current = floats.length;

  function addFloat(emoji: string, name: string) {
    if (countRef.current >= MAX_FLOATING_REACTIONS) return;
    countRef.current += 1;
    const id = crypto.randomUUID();
    setFloats((prev) => [...prev, { id, emoji, name, left: randomLeft() }]);
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), REACTION_FLOAT_MS);
  }
  const addFloatRef = useRef(addFloat);
  addFloatRef.current = addFloat;

  useEffect(() => {
    if (!room || !enabled) return;
    function onData(payload: Uint8Array, participant?: Participant, _kind?: unknown, topic?: string) {
      if (topic !== REACTION_TOPIC || !participant) return;
      const emoji = parseReaction(payload);
      if (!emoji) return;
      const now = Date.now();
      const last = lastFrom.current.get(participant.identity) ?? 0;
      if (now - last < REACTION_MIN_INTERVAL_MS) return;
      lastFrom.current.set(participant.identity, now);
      addFloatRef.current(emoji, participant.name || participant.identity);
    }
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, enabled]);

  /** Returns false if throttled or the publish failed (the tray stays usable either way). */
  async function send(emoji: string): Promise<boolean> {
    if (!room || !enabled) return false;
    const now = Date.now();
    if (now - lastSent.current < REACTION_MIN_INTERVAL_MS) return false;
    lastSent.current = now;
    try {
      // Lossy is fine for a reaction — a dropped one is simply never shown.
      await room.localParticipant.publishData(encodeReaction(emoji), { reliable: false, topic: REACTION_TOPIC });
    } catch (error) {
      console.error("[reactions] Failed to publish reaction", error);
      return false;
    }
    addFloatRef.current(emoji, "You");
    return true;
  }

  return { floats, send };
}

/** Control-bar button + 4x4 emoji tray. Closes after a pick, on Escape, or on an outside click. */
export function ReactionsControl({ send }: { send: (emoji: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {open && (
        <div
          role="group"
          aria-label="Reactions"
          className={`absolute bottom-full right-0 z-10 mb-2 grid grid-cols-4 gap-1 rounded-lg border p-2 shadow-lg ${LK_PANEL_CLASS}`}
        >
          {REACTIONS.map(({ emoji, label }) => (
            <button
              key={emoji}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => {
                setOpen(false);
                void send(emoji);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-md text-2xl hover:bg-white/10 focus-visible:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="lk-button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Reactions"
        onClick={() => setOpen((v) => !v)}
      >
        <Smile className="h-4 w-4" />
        <span className="hidden sm:inline">React</span>
      </button>
    </div>
  );
}

function truncate(name: string) {
  return name.length > REACTION_NAME_MAX_CHARS ? `${name.slice(0, REACTION_NAME_MAX_CHARS - 1)}…` : name;
}

/**
 * Floating reactions — a sibling of <LiveKitRoom>, not inside it (same reason as the other overlays: it must
 * stay visible over a screen share), and `pointer-events-none` so it never intercepts a click on the video or
 * controls. Rises ~200px over REACTION_FLOAT_MS; under prefers-reduced-motion it fades in place instead.
 */
export function ReactionsOverlay({ floats }: { floats: FloatingReaction[] }) {
  if (floats.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes nasiha-reaction-rise {
          0% { transform: translate(-50%, 0); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate(-50%, -200px); opacity: 0; }
        }
        @keyframes nasiha-reaction-fade {
          0% { transform: translate(-50%, 0); opacity: 0; }
          15% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translate(-50%, 0); opacity: 0; }
        }
        .nasiha-reaction { animation: nasiha-reaction-rise ${REACTION_FLOAT_MS}ms ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .nasiha-reaction { animation-name: nasiha-reaction-fade; animation-timing-function: linear; }
        }
      `}</style>
      {floats.map((float) => (
        <div
          key={float.id}
          className="nasiha-reaction absolute flex flex-col items-center gap-1"
          style={{ left: `${float.left}%`, bottom: "calc(69px + 12%)" }}
        >
          <span className={`${REACTION_EMOJI_SIZE_CLASS} leading-none`}>{float.emoji}</span>
          <span className="rounded-full bg-black/70 px-2 py-0.5 text-xs leading-none text-white">{truncate(float.name)}</span>
        </div>
      ))}
    </div>
  );
}
