"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Circle, Copy, Square } from "lucide-react";
import { RoomEvent, type Room } from "livekit-client";
import { LK_BUTTON_CLASS } from "@/components/livekit-control-styles";
import { RECORDING_QUALITIES, RECORDING_QUALITY_IDS, loadRecordingQuality, type RecordingQualityId } from "@/lib/recording-quality";
import { useRecordingQuality } from "@/components/recording-quality-picker";
import { recordingLink, saveRecording } from "@/lib/recording-client";
import type { RoomCredentials, RoomRecordingMetadata } from "@/lib/room-types";

/** sessionStorage flag (per tab) set once the host has recorded, so leaving lands on the download screen. */
export const RECORDED_FLAG = "showup:recorded";

function parseMetadata(raw: string | undefined): RoomRecordingMetadata {
  try {
    const parsed = JSON.parse(raw || "{}") as Partial<RoomRecordingMetadata>;
    return { recording: parsed.recording === true, egressId: parsed.egressId ?? null };
  } catch {
    return { recording: false, egressId: null };
  }
}

/** Live "is this meeting being recorded", straight from LiveKit room metadata, which the server sets. */
function useIsRecording(room: Room | null): boolean {
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!room) return;
    const update = () => setRecording(parseMetadata(room.metadata).recording);
    update();
    room.on(RoomEvent.RoomMetadataChanged, update);
    room.on(RoomEvent.Connected, update);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, update);
      room.off(RoomEvent.Connected, update);
    };
  }, [room]);
  return recording;
}

/** Shown to everyone (host and guests) for as long as a recording is running. */
export function RecordingBanner({ room }: { room: Room | null }) {
  const recording = useIsRecording(room);
  if (!recording) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-50 flex justify-center px-2">
      <div role="status" className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg">
        <Circle className="h-3 w-3 animate-pulse fill-white" /> This showup session is being recorded
      </div>
    </div>
  );
}

/** Host-only: start/stop recording and see how to get the recording back. */
export function HostRecordingPanel({ credentials, room }: { credentials: RoomCredentials; room: Room | null }) {
  const recording = useIsRecording(room);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [quality, setQuality] = useRecordingQuality();
  const [menuOpen, setMenuOpen] = useState(false);
  // What the running recording was started with (this tab only; a reload forgets it, and the label just disappears).
  const [recordingWith, setRecordingWith] = useState<RecordingQualityId | null>(null);

  async function toggle() {
    setMenuOpen(false);
    setBusy(true);
    setError(null);
    const startedWith = loadRecordingQuality();
    try {
      const res = await fetch("/api/rooms/recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: credentials.code, hostSecret: credentials.hostSecret, action: recording ? "stop" : "start", quality: startedWith }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
        return;
      }
      setRecordingWith(recording ? null : startedWith);
      if (!recording && credentials.recId && credentials.hostSecret) {
        try {
          sessionStorage.setItem(RECORDED_FLAG, "1");
        } catch {
          // Storage unavailable: leaving just won't jump to the download screen.
        }
        saveRecording({ recId: credentials.recId, hostSecret: credentials.hostSecret, code: credentials.code });
        setShowInfo(true);
      }
    } catch {
      setError("Couldn't reach Showup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked: the value is still on screen.
    }
  }

  const link = credentials.recId && credentials.hostSecret ? `${window.location.origin}${recordingLink(credentials.recId, credentials.hostSecret)}` : null;

  return (
    <div className="pointer-events-none absolute right-4 top-14 z-50 flex max-w-[18rem] flex-col items-end gap-2">
      <div className="pointer-events-auto flex items-stretch gap-1">
        <button
          type="button"
          onClick={toggle}
          disabled={busy || !room}
          title={recording && recordingWith ? `Recording at ${RECORDING_QUALITIES[recordingWith].label}` : undefined}
          className={`inline-flex items-center gap-1.5 text-sm ${LK_BUTTON_CLASS}`}
        >
          {recording ? <Square className="h-4 w-4 fill-current" /> : <Circle className="h-4 w-4 fill-red-500 text-red-500" />}
          {busy ? "One moment…" : recording ? "Stop recording" : "Record"}
          {recording && recordingWith && !busy && <span className="text-xs text-white/60">· {RECORDING_QUALITIES[recordingWith].label}</span>}
        </button>
        <button
          type="button"
          aria-label="Recording quality"
          aria-expanded={menuOpen}
          data-testid="recording-quality-chevron"
          onClick={() => setMenuOpen((open) => !open)}
          className={`inline-flex items-center px-1.5 ${LK_BUTTON_CLASS}`}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {menuOpen && (
        <div role="radiogroup" aria-label="Recording quality" className={`pointer-events-auto flex flex-col gap-1 rounded-lg p-2 text-xs ${LK_BUTTON_CLASS}`}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Recording quality</span>
          {RECORDING_QUALITY_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={quality === id}
              onClick={() => {
                setQuality(id);
                setMenuOpen(false);
              }}
              className={`flex flex-col rounded px-2 py-1 text-left hover:bg-white/10 ${quality === id ? "bg-white/15" : ""}`}
            >
              <span className="font-medium">{RECORDING_QUALITIES[id].label}</span>
              <span className="text-white/60">{RECORDING_QUALITIES[id].hint}</span>
            </button>
          ))}
          <p className="px-2 text-white/50">{recording ? "Applies the next time you start recording." : "Used when you press Record."}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="pointer-events-auto rounded-md bg-destructive px-3 py-2 text-xs text-white shadow">
          {error}
        </p>
      )}
      {showInfo && (
        <div className={`pointer-events-auto flex flex-col gap-2 rounded-lg p-3 text-xs ${LK_BUTTON_CLASS}`}>
          <p>Only you can download this recording. Save these in case you lose this page:</p>
          {credentials.passcode && (
            <div className="flex items-center justify-between gap-2">
              <span>
                Passcode: <strong>{credentials.passcode}</strong>
              </span>
              <button type="button" aria-label="Copy passcode" onClick={() => copy("passcode", credentials.passcode!)}>
                {copied === "passcode" ? "Copied" : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
          {link && (
            <button type="button" className="text-left underline" onClick={() => copy("link", link)}>
              {copied === "link" ? "Copied" : "Copy the private download link"}
            </button>
          )}
          <button type="button" className="self-end text-white/70" onClick={() => setShowInfo(false)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
