"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, ShieldCheck, ShieldOff, X } from "lucide-react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { LiveKitRoom, VideoTrack, isTrackReference, useTracks } from "@livekit/components-react";
import { LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/livekit-control-styles";
import type { RoomCredentials } from "@/lib/room-types";

type Pending = { identity: string; name: string; track: Parameters<typeof VideoTrack>[0]["trackRef"] | null };

type DocumentPip = { requestWindow(options?: { width?: number; height?: number }): Promise<Window> };

const TITLE_FLASH_MS = 1000;

/** Short two-tone chime. WebAudio only, so no asset to load; silently skipped where audio is blocked. */
function chime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.15);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    // Audio blocked or unsupported.
  }
}

/** Copies the page's CSS into a pop-out window so Tailwind classes render there too. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      target.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
}

/** Reports the lobby room's waiting guests (everyone but the host's own hidden connection) as ghost-tile data. */
function LobbyWatcher({ onPending }: { onPending: (pending: Pending[]) => void }) {
  const refs = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  useEffect(() => {
    onPending(
      refs
        .filter((ref) => !ref.participant.isLocal)
        .map((ref) => ({
          identity: ref.participant.identity,
          name: ref.participant.name || "Guest",
          track: isTrackReference(ref) ? ref : null,
        })),
    );
  }, [refs, onPending]);
  return null;
}

function GhostTiles({ pending, onDecide, busy }: { pending: Pending[]; onDecide: (identity: string, decision: "approve" | "reject") => void; busy: Set<string> }) {
  if (pending.length === 0) return <p className="p-3 text-xs text-white/70">Nobody is waiting.</p>;
  return (
    <ul className="flex flex-col gap-2 p-2">
      {pending.map((guest) => (
        <li key={guest.identity} className="relative overflow-hidden rounded-lg bg-black/50 opacity-90">
          <div className="aspect-video w-full">
            {guest.track ? (
              <VideoTrack trackRef={guest.track} className="h-full w-full object-cover opacity-80" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/60">No camera</div>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/60 px-2 py-1.5">
            <span className="min-w-0 truncate text-sm font-medium text-white">{guest.name}</span>
            <span className="flex shrink-0 gap-1.5">
              <button
                type="button"
                disabled={busy.has(guest.identity)}
                onClick={() => onDecide(guest.identity, "approve")}
                aria-label={`Approve ${guest.name}`}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </button>
              <button
                type="button"
                disabled={busy.has(guest.identity)}
                onClick={() => onDecide(guest.identity, "reject")}
                aria-label={`Reject ${guest.name}`}
                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  credentials: RoomCredentials;
  /** The main meeting room, to notice a whole-screen share. */
  room: Room | null;
  sharing: boolean;
  onToast: (message: string) => void;
};

/**
 * Host-only lobby control. Toggles the lobby (server-side, for whoever joins
 * next) and keeps a second, hidden, subscribe-only connection to the lobby
 * room for the whole meeting so guests already waiting stay visible and
 * decidable even after the lobby is switched off. Each waiting guest is a
 * semi-transparent ghost tile with Approve/Reject, shown in the page and
 * optionally in a Document Picture-in-Picture window. Alerts: toast, chime,
 * count badge, tab-title flash, and a system notification when the tab is hidden.
 */
export function LobbyHostPanel({ credentials, room, sharing, onToast }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [lobby, setLobby] = useState<{ token: string; serverUrl: string } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(true);
  const [pip, setPip] = useState<Window | null>(null);
  const seen = useRef(new Set<string>());
  const warnedShare = useRef(false);

  const visible = pending.filter((guest) => !decided.has(guest.identity));

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/rooms/lobby", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: credentials.code, hostSecret: credentials.hostSecret, ...body }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      return payload as { enabled: boolean; token: string; serverUrl: string };
    },
    [credentials.code, credentials.hostSecret],
  );

  // Restore state (and get the lobby token) on mount, including after a host refresh.
  useEffect(() => {
    let cancelled = false;
    call({ action: "connect" })
      .then((state) => {
        if (cancelled) return;
        setEnabled(state.enabled);
        setLobby({ token: state.token, serverUrl: state.serverUrl });
      })
      .catch(() => onToast("Couldn't reach the lobby. Reload the page to try again."));
    return () => {
      cancelled = true;
    };
  }, [call, onToast]);

  async function toggle() {
    const next = !enabled;
    try {
      // Asked for on the enabling click (a user gesture) so the fallback alerts can work when this tab is hidden.
      if (next && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
      const state = await call({ action: "set", enabled: next });
      setEnabled(state.enabled);
      onToast(state.enabled ? "Lobby on: new guests wait for your approval" : "Lobby off: guests already waiting stay until you decide");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Couldn't change the lobby.");
    }
  }

  async function decide(identity: string, decision: "approve" | "reject") {
    setBusy((prev) => new Set(prev).add(identity));
    try {
      const res = await fetch("/api/rooms/lobby/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: credentials.code, hostSecret: credentials.hostSecret, identity, decision }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        onToast(typeof payload?.error === "string" ? payload.error : "Couldn't record that decision.");
      }
      // Success or "already decided": either way the tile is done.
      setDecided((prev) => new Set(prev).add(identity));
    } catch {
      onToast("Couldn't reach Showup. Try again.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(identity);
        return next;
      });
    }
  }

  // Alert on each newly waiting guest.
  useEffect(() => {
    for (const guest of visible) {
      if (seen.current.has(guest.identity)) continue;
      seen.current.add(guest.identity);
      onToast(`${guest.name} is waiting to join`);
      chime();
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("Someone is waiting to join", { body: guest.name, tag: "showup-lobby" });
        } catch {
          // Notifications unavailable in this context.
        }
      }
    }
  }, [visible, onToast]);

  // Flash the tab title while anyone is waiting and the tab isn't in front.
  useEffect(() => {
    if (visible.length === 0) return;
    const original = document.title;
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      document.title = on && document.hidden ? `(${visible.length}) Waiting to join` : original;
    }, TITLE_FLASH_MS);
    return () => {
      clearInterval(timer);
      document.title = original;
    };
  }, [visible.length]);

  // Sharing a whole screen would put the ghost tiles (and the guests' cameras) into the shared video.
  useEffect(() => {
    if (!sharing || !enabled || warnedShare.current || !room) return;
    const timer = setTimeout(() => {
      const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack;
      if (track?.getSettings().displaySurface === "monitor") {
        warnedShare.current = true;
        onToast("You're sharing your whole screen. Waiting guests' tiles would show up in it: pop the lobby out or share a window instead.");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [sharing, enabled, room, onToast]);

  // The lobby connection should die with the meeting screen; nothing else to clean up.
  useEffect(() => {
    if (!room) return;
    const closeOnLeave = () => pip?.close();
    room.on(RoomEvent.Disconnected, closeOnLeave);
    return () => {
      room.off(RoomEvent.Disconnected, closeOnLeave);
    };
  }, [room, pip]);

  async function popOut() {
    const api = (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
    if (!api) return;
    try {
      const win = await api.requestWindow({ width: 380, height: 460 });
      copyStyles(win.document);
      win.document.body.className = "bg-[#1d1d1d] text-white";
      win.addEventListener("pagehide", () => setPip(null));
      setPip(win);
    } catch {
      onToast("Couldn't open the pop-out window.");
    }
  }

  const pipSupported = typeof window !== "undefined" && "documentPictureInPicture" in window;
  const tiles = <GhostTiles pending={visible} onDecide={decide} busy={busy} />;

  return (
    <>
      {lobby && (
        <LiveKitRoom token={lobby.token} serverUrl={lobby.serverUrl} connect audio={false} video={false}>
          <LobbyWatcher onPending={setPending} />
        </LiveKitRoom>
      )}
      <div className="pointer-events-none absolute bottom-24 right-4 z-50 flex max-w-[22rem] flex-col items-end gap-2">
        {open && (visible.length > 0 || pip) && (
          <div className={`pointer-events-auto max-h-[60vh] w-[20rem] overflow-y-auto rounded-lg border ${LK_PANEL_CLASS}`}>
            <div className="flex items-center justify-between px-3 pt-2 text-xs text-white/70">
              <span>Waiting to join</span>
              {pipSupported && !pip && (
                <button type="button" onClick={popOut} className="inline-flex items-center gap-1 hover:text-white">
                  <ExternalLink className="h-3 w-3" /> Pop out
                </button>
              )}
            </div>
            {pip ? <p className="p-3 text-xs text-white/70">Shown in the pop-out window.</p> : tiles}
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={!lobby}
          aria-pressed={enabled}
          className={`pointer-events-auto text-sm ${LK_BUTTON_CLASS}`}
        >
          {enabled ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <ShieldOff className="h-4 w-4" />}
          <span className="hidden sm:inline">Lobby {enabled ? "on" : "off"}</span>
          {visible.length > 0 && (
            <span
              onClick={(event) => {
                event.stopPropagation();
                setOpen((value) => !value);
              }}
              className="ml-1 rounded-full bg-red-600 px-1.5 text-xs font-semibold"
              aria-label={`${visible.length} waiting`}
            >
              {visible.length}
            </span>
          )}
        </button>
      </div>
      {pip && createPortal(<div className="min-h-screen">{tiles}</div>, pip.document.body)}
    </>
  );
}
