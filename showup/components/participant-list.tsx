"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Users, Video, VideoOff, X } from "lucide-react";
import { ParticipantKind, RoomEvent, type Room } from "livekit-client";
import { buildRoster, rosterSignature, type ParticipantInfo, type PersonRow } from "@/lib/participants";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/livekit-control-styles";

/** A safety net under the room events: the list re-reads the room this often, so a missed event can't leave it stale. */
const POLL_MS = 2_000;

/** Room events after which who is here, or what they're doing, may have changed. */
const CHANGE_EVENTS = [
  RoomEvent.Connected,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ParticipantMetadataChanged,
  RoomEvent.ParticipantNameChanged,
] as const;

/** Reads the room as it is now: you, and everyone else in it (not recorders or other non-people the server may add). */
function snapshot(room: Room): ParticipantInfo[] {
  const others = Array.from(room.remoteParticipants.values()).filter((participant) => participant.kind === ParticipantKind.STANDARD);
  return [room.localParticipant, ...others].map((participant) => ({
    identity: participant.identity,
    name: participant.name,
    metadata: participant.metadata,
    isLocal: participant.isLocal,
    micOn: participant.isMicrophoneEnabled,
    cameraOn: participant.isCameraEnabled,
    speaking: participant.isSpeaking,
  }));
}

/** The room's people, kept current from LiveKit's own room state; only changes when what the list shows changes. */
function useRoster(room: Room | null, overlayIds: readonly string[], viewerIsHost: boolean): PersonRow[] {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const signature = useRef("");
  const overlayRef = useRef(overlayIds);
  overlayRef.current = overlayIds;

  useEffect(() => {
    if (!room) {
      setRows([]);
      return;
    }
    function refresh() {
      if (!room) return;
      const next = buildRoster(snapshot(room), overlayRef.current, viewerIsHost);
      const nextSignature = rosterSignature(next);
      if (nextSignature === signature.current) return;
      signature.current = nextSignature;
      setRows(next);
    }
    refresh();
    for (const event of CHANGE_EVENTS) room.on(event, refresh);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      for (const event of CHANGE_EVENTS) room.off(event, refresh);
      clearInterval(timer);
    };
  }, [room, viewerIsHost]);

  // Who is on the overlay changes on its own (it isn't a room event), so re-read when it does.
  useEffect(() => {
    if (!room) return;
    const next = buildRoster(snapshot(room), overlayIds, viewerIsHost);
    const nextSignature = rosterSignature(next);
    if (nextSignature === signature.current) return;
    signature.current = nextSignature;
    setRows(next);
  }, [room, overlayIds, viewerIsHost]);

  return rows;
}

/**
 * "People (N)": a button with a live count that opens a small list of everyone in the session by name, camera on or
 * off, with you / host tags, mic and camera state and a speaking pulse. Closed by default so it never covers the
 * shared screen. Uses only what LiveKit already shares in the room; nothing is sent or stored. On the host's view a
 * guest on the shared-screen overlay is tagged (the pointer and pen controls stay in the overlay panel).
 */
export function ParticipantList({ room, overlayIds, isHost }: { room: Room | null; overlayIds: readonly string[]; isHost: boolean }) {
  const rows = useRoster(room, overlayIds, isHost);
  const [open, setOpen] = useState(false);

  if (!room) return null;

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="showup-people"
        aria-label={`People (${rows.length})`}
        className={`${LK_BUTTON_CLASS} ${open ? LK_BUTTON_ACTIVE_CLASS : ""}`}
        data-testid="people-button"
      >
        <Users className="h-4 w-4" />
        <span className="hidden sm:inline">People</span>
        <span data-testid="people-count" className="rounded-full bg-white/15 px-1.5 text-xs tabular-nums">
          {rows.length}
        </span>
      </button>
      {open && (
        <div
          id="showup-people"
          role="dialog"
          aria-label="People in this session"
          data-testid="people-list"
          className={`absolute bottom-full left-0 z-50 mb-2 w-[min(18rem,calc(100vw-2rem))] rounded-lg border p-2 text-sm shadow-lg ${LK_PANEL_CLASS}`}
        >
          <div className="mb-1 flex items-center justify-between px-1 text-xs text-white/60">
            <span>
              {rows.length} in this session
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close the list of people" className="rounded p-0.5 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 rounded px-1 py-1" data-testid="people-row">
                <span
                  aria-hidden={!row.speaking}
                  title={row.speaking ? "Speaking" : undefined}
                  className={`h-2 w-2 flex-none rounded-full ${row.speaking ? "animate-pulse bg-emerald-400" : "bg-transparent"}`}
                />
                {row.speaking && <span className="sr-only">Speaking</span>}
                <span className="min-w-0 flex-1 truncate text-white">
                  {row.name}
                  {row.you && <span className="text-white/60"> (you)</span>}
                </span>
                {row.host && <span className="flex-none rounded bg-white/15 px-1.5 text-[0.65rem] uppercase tracking-wide">Host</span>}
                {row.onOverlay && <span className="flex-none rounded bg-white/15 px-1.5 text-[0.65rem]">On the share</span>}
                <span className="flex flex-none items-center gap-1.5 text-white/70">
                  {row.micOn ? <Mic className="h-3.5 w-3.5" aria-label="Microphone on" /> : <MicOff className="h-3.5 w-3.5 text-red-300" aria-label="Microphone off" />}
                  {row.cameraOn ? <Video className="h-3.5 w-3.5" aria-label="Camera on" /> : <VideoOff className="h-3.5 w-3.5 text-red-300" aria-label="Camera off" />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
