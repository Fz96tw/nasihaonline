"use client";

import { useEffect, useState } from "react";
import { Circle, Copy, Square } from "lucide-react";
import { RoomEvent, type Room } from "livekit-client";
import { LK_BUTTON_CLASS } from "@/components/livekit-control-styles";
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

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms/recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: credentials.code, hostSecret: credentials.hostSecret, action: recording ? "stop" : "start" }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
        return;
      }
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
      <button
        type="button"
        onClick={toggle}
        disabled={busy || !room}
        className={`pointer-events-auto inline-flex items-center gap-1.5 text-sm ${LK_BUTTON_CLASS}`}
      >
        {recording ? <Square className="h-4 w-4 fill-current" /> : <Circle className="h-4 w-4 fill-red-500 text-red-500" />}
        {busy ? "One moment…" : recording ? "Stop recording" : "Record"}
      </button>
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
