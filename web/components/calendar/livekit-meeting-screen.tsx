"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, RotateCcw, Users, X } from "lucide-react";
import { RoomEvent, VideoPreset, VideoPresets, type RemoteParticipant, type Room } from "livekit-client";
import { LiveKitRoom, VideoConference, useChat, useParticipants, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { getCsrfToken } from "@/lib/csrf-client";
import { getPublicMeetingClosingNote } from "@/lib/legal";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/calendar/livekit-control-styles";
import { PresenterOverlayControl } from "@/components/calendar/presenter-overlay-control";

/**
 * Title/host banner pinned to the top of the call — per-viewer local state
 * only (same as DisclaimerReminderFlash below), dismissible so it doesn't
 * permanently take up screen space once someone's confirmed which meeting
 * they're in (user request, 2026-08-25). Re-appears on a fresh page load/
 * rejoin — nothing about the dismissal is persisted.
 */

/**
 * Chrome/Edge-only `getDisplayMedia()` extension
 * (https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia#selfbrowsersurface)
 * not yet in TS's DOM lib.
 */
type DisplayMediaStreamOptionsWithSelfBrowserSurface = DisplayMediaStreamOptions & {
  selfBrowserSurface?: "include" | "exclude";
};

/**
 * Webcam is shown small (sidebar strip under the "speaker" layout — see
 * livekit-egress.ts) so there's little value in LiveKit's 720p/3-simulcast-
 * layer default; capping capture at 480p with a single simulcast layer cuts
 * per-participant encode and SFU forwarding cost without touching screen
 * share, which keeps its own (larger) default resolution.
 */
const WEBCAM_480P = new VideoPreset(854, 480, 600_000, 20);
const ROOM_OPTIONS = {
  videoCaptureDefaults: { resolution: WEBCAM_480P.resolution },
  publishDefaults: { videoSimulcastLayers: [VideoPresets.h180] },
};

/**
 * VideoConference's built-in screen-share button (from ControlBar) calls
 * `getDisplayMedia()` with no way to pass capture options through — the
 * prefab exposes no captureOptions prop for it. Patching the browser API
 * directly, for the lifetime of this meeting screen, is the only way to
 * default `selfBrowserSurface: "exclude"` so this meeting's own tab (or a
 * window/monitor showing it) is hidden from the share picker. Without it,
 * an attendee sharing that surface recurses the meeting UI into itself in
 * the shared video (reported 2026-08-25). Only overrides the default —
 * an explicit caller-supplied value (there is none today, but future code
 * might add one) still wins.
 *
 * Bug fixed 2026-08-26: unconditionally did `.getDisplayMedia.bind(...)`,
 * which crashed the whole page for any attendee on a browser with no
 * getDisplayMedia at all (iOS Safari has no screen-share API — its
 * `mediaDevices.getDisplayMedia` is `undefined`) — `.bind()` on `undefined`
 * threw a TypeError on mount, surfacing as a generic client-side
 * "Application error" with nothing in the server logs (reported: a
 * MeetingRequest invitee couldn't join at all). Now a no-op when the API
 * isn't there, same as the browser's own behavior for an unsupported
 * feature — screen sharing (and thus this mirror-prevention) is simply
 * unavailable, not a hard failure.
 */
function usePreventScreenShareSelfMirror() {
  useEffect(() => {
    const { mediaDevices } = navigator;
    if (!mediaDevices?.getDisplayMedia) return;
    const original = mediaDevices.getDisplayMedia.bind(mediaDevices);
    mediaDevices.getDisplayMedia = (options?: DisplayMediaStreamOptionsWithSelfBrowserSurface) =>
      original({ selfBrowserSurface: "exclude", ...options });
    return () => {
      mediaDevices.getDisplayMedia = original;
    };
  }, []);
}

function MeetingBanner({ title, organizerName }: { title: string; organizerName: string }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center p-2">
      <div className="pointer-events-auto relative rounded-md border bg-background/95 px-4 py-2 pr-8 text-center shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="absolute right-1.5 top-1.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="mb-1 flex items-center justify-center gap-1.5">
          <Image src="/images/nasihalogo-cropped.png" alt="NASIHA" width={296} height={334} className="h-3.5 w-auto" />
          <span className="text-[.6rem] font-black uppercase leading-none tracking-[.1em] text-logo">
            nasihaforyou.org
          </span>
        </div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">Hosted by {organizerName}</p>
      </div>
    </div>
  );
}

/**
 * Per-viewer reminder of the meeting's conduct/platform disclaimer — local
 * React state only, never broadcast via LiveKit, so only the person who
 * just joined sees it. Centered and click-to-dismiss (user request,
 * 2026-08-25) rather than auto-fading, so it doesn't disappear before
 * someone's actually read it. Shown for every LiveKit meeting (user
 * request, 2026-08-25) — originally gated to open events only, on the
 * theory that a private/invited meeting's attendees already agreed to the
 * community-wide Code of Conduct once at /join, but that made it
 * inconsistently absent depending on the event's visibility.
 *
 * Deliberately NOT rendered inside <LiveKitRoom> (doesn't need
 * useRoomContext()) — reported not visible at all when it was: an
 * absolutely-positioned overlay nested inside LiveKitRoom's own DOM tree
 * risks losing to its internal layout/stacking in ways that are opaque
 * from the outside. Rendering it as a sibling at the top level, same as
 * the banner below, avoids that entirely.
 *
 * `isQuickRecording` is passed straight through to getPublicMeetingClosingNote
 * — see its own doc comment for which clauses that drops — and additionally
 * prepends QUICK_RECORDING_INTRO_BLURB, a short explainer of the feature
 * and its Record/Reset/Exit controls. That blurb is screen-specific UI
 * copy, not reusable legal text, so it lives here rather than in
 * lib/legal.ts alongside the ToS-flavored closing note.
 */
const QUICK_RECORDING_INTRO_BLURB =
  "Quick Recording lets you record a short video of yourself to share with the community. Click Record to start. Reset discards the current take so you can try again. Exit leaves without saving once you're done.";

function DisclaimerReminderFlash({ isQuickRecording }: { isQuickRecording: boolean }) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="pointer-events-auto w-full max-w-sm cursor-pointer rounded-lg border bg-background p-4 text-left shadow-lg"
      >
        {isQuickRecording && <p className="mb-2 text-sm font-medium">{QUICK_RECORDING_INTRO_BLURB}</p>}
        <p className="text-sm text-muted-foreground">{getPublicMeetingClosingNote("livekit", isQuickRecording)}</p>
        <p className="mt-2 text-xs font-medium text-muted-foreground">Tap to dismiss</p>
      </button>
    </div>
  );
}

const TOAST_DURATION_MS = 5_000;

type Toast = { id: string; message: string };

type ParticipantSummary = {
  identity: string;
  name: string;
  isLocal: boolean;
  /** identity === hostId (Event.hostId, the LiveKit identity a host's token is minted with) — fixed, not toggleable via the co-host control. Always false for a MeetingRequest (no hostId prop passed). */
  isHost: boolean;
  /** identity is in the live coHostUserIds set (Recording Access initiative) — see CoHostStateListener. Always false for a MeetingRequest. */
  isCoHost: boolean;
};

/**
 * Live attendee list — must render inside <LiveKitRoom> to reach
 * useParticipants(), but renders no UI of its own (same pattern as
 * ParticipantActivityListener below: reports up via onChange so the actual
 * button/panel can live outside <LiveKitRoom>'s DOM tree). useParticipants()
 * already includes the local participant and re-renders on join/leave.
 * `hostId`/`coHostUserIds` are passed in (not read here) so a change to
 * either — e.g. a co-host grant arriving via CoHostStateListener — also
 * recomputes each row's badge, not just a participant join/leave.
 */
function ParticipantsListener({
  hostId,
  coHostUserIds,
  onChange,
}: {
  hostId: string | undefined;
  coHostUserIds: string[];
  onChange: (participants: ParticipantSummary[]) => void;
}) {
  const participants = useParticipants();

  useEffect(() => {
    onChange(
      participants.map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
        isLocal: p.isLocal,
        isHost: hostId !== undefined && p.identity === hostId,
        isCoHost: coHostUserIds.includes(p.identity),
      })),
    );
  }, [participants, hostId, coHostUserIds, onChange]);

  return null;
}

/**
 * Listens for remote participant join/leave events — must render inside
 * <LiveKitRoom> to reach useRoomContext(), but renders no UI of its own.
 * Reports each event up to the parent via onEvent, so the actual toast
 * stack can live outside LiveKitRoom's DOM tree (see ParticipantActivityToasts'
 * doc comment on why that matters — the disclaimer flash had the identical
 * "invisible when nested inside LiveKitRoom" bug). RoomEvent.ParticipantConnected/
 * Disconnected only fire for *remote* participants, which is correct here:
 * nobody needs to be told they themselves joined.
 */
function ParticipantActivityListener({ onEvent }: { onEvent: (message: string) => void }) {
  const room = useRoomContext();

  useEffect(() => {
    function onConnected(participant: RemoteParticipant) {
      onEvent(`${participant.name || participant.identity} joined`);
    }
    function onDisconnected(participant: RemoteParticipant) {
      onEvent(`${participant.name || participant.identity} left`);
    }
    room.on(RoomEvent.ParticipantConnected, onConnected);
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
    };
  }, [room, onEvent]);

  return null;
}

/** Mirrors lib/livekit.ts's RoomMetadata shape — kept as a separate client-side type rather than importing it (a "server-only" module). */
type RoomMetadata = { recording: boolean; egressId: string | null; coHostUserIds: string[] };

/**
 * Mirrors ParticipantActivityListener's shape exactly — must render inside
 * <LiveKitRoom> to reach useRoomContext(), reports state up via callbacks so
 * the actual Record/Stop button can live outside LiveKitRoom's DOM tree
 * (objective 4). Room metadata (not a data-channel message) is the sync
 * mechanism: the server sets it once via RoomServiceClient.updateRoomMetadata
 * whenever recording starts/stops (lib/livekit.ts), and LiveKit already
 * pushes RoomEvent.RoomMetadataChanged to every connected client for free —
 * that's what keeps host/co-host in sync across everyone in the room
 * without extra plumbing. The initial mount read is silent (no toast) —
 * only actual transitions after that toast, so joining a call that's
 * already recording doesn't announce a false "started".
 */
function RecordingStateListener({
  onChange,
  onToast,
}: {
  onChange: (recording: boolean) => void;
  onToast: (message: string) => void;
}) {
  const room = useRoomContext();
  const previousRef = useRef<boolean | null>(null);

  useEffect(() => {
    function apply(metadata: string | undefined) {
      let recording = false;
      if (metadata) {
        try {
          recording = (JSON.parse(metadata) as Partial<RoomMetadata>).recording === true;
        } catch {
          recording = false;
        }
      }
      onChange(recording);
      if (previousRef.current !== null && previousRef.current !== recording) {
        onToast(recording ? "Recording started" : "Recording stopped");
      }
      previousRef.current = recording;
    }

    apply(room.metadata);
    function onMetadataChanged(metadata: string) {
      apply(metadata);
    }
    room.on(RoomEvent.RoomMetadataChanged, onMetadataChanged);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, onMetadataChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  return null;
}

/**
 * Same shape/mechanism as RecordingStateListener, for the `coHostUserIds`
 * slice of the same room-metadata blob instead of `recording` — grant/
 * revoke calls made by anyone (POST /api/events/:id/meeting/co-hosts) reach
 * every connected client's ParticipantsListener via this, live, no reload.
 * No toast (unlike recording) — a co-host change is reflected directly in
 * the participant list's own badges, which is feedback enough.
 */
function CoHostStateListener({ onChange }: { onChange: (coHostUserIds: string[]) => void }) {
  const room = useRoomContext();

  useEffect(() => {
    function apply(metadata: string | undefined) {
      if (!metadata) {
        onChange([]);
        return;
      }
      try {
        const parsed = JSON.parse(metadata) as Partial<RoomMetadata>;
        onChange(Array.isArray(parsed.coHostUserIds) ? parsed.coHostUserIds : []);
      } catch {
        onChange([]);
      }
    }

    apply(room.metadata);
    function onMetadataChanged(metadata: string) {
      apply(metadata);
    }
    room.on(RoomEvent.RoomMetadataChanged, onMetadataChanged);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, onMetadataChanged);
    };
  }, [room, onChange]);

  return null;
}

/**
 * Archives this participant's own chat messages into the event's
 * discussion thread (LiveKit meeting chat archival) — mirrors
 * ParticipantActivityListener/RecordingStateListener's shape (headless,
 * inside <LiveKitRoom>, no UI of its own).
 *
 * VideoConference's built-in Chat panel uses LiveKit's `lk.chat` data
 * channel via the same useChat() hook — calling it again here just
 * subscribes to the identical message stream, no interference with the
 * panel itself. Only messages *this* participant sent are ever POSTed
 * (`msg.from?.identity === room.localParticipant.identity`): the archive
 * endpoint is a plain HTTP route, not a LiveKit-signed channel, so
 * forwarding a message attributed to someone else would let any attendee
 * forge lines as if another participant said them. Each client is
 * responsible only for archiving its own messages; the server derives the
 * true sender identity/name from the caller's own session, never from this
 * request body.
 *
 * `sentIds` dedupes across re-renders (chatMessages is a growing array, not
 * a stream of new-message events) and `keepalive: true` gives the POST a
 * chance to complete even if the tab closes right as "Leave" is clicked.
 */
function ChatCaptureListener({ chatEndpoint }: { chatEndpoint: string | null | undefined }) {
  const room = useRoomContext();
  const { chatMessages } = useChat();
  const sentIds = useRef(new Set<string>());

  useEffect(() => {
    if (!chatEndpoint) return;
    const myIdentity = room.localParticipant.identity;
    const pending = chatMessages.filter(
      (msg) => msg.from?.identity === myIdentity && !sentIds.current.has(msg.id),
    );
    if (pending.length === 0) return;
    for (const msg of pending) sentIds.current.add(msg.id);

    async function archive() {
      // Every mutating /api route requires this (middleware.ts's double-
      // submit CSRF check) — a fetch missing it 403s, but fetch() only
      // rejects on a network failure, not a non-2xx status, so skipping
      // this silently "succeeded" (marked sent, never retried, nothing
      // logged) with zero rows ever actually written. Same header every
      // other mutating call in this file already sends (fetchToken,
      // RecordingControl.toggle).
      const csrfToken = await getCsrfToken();
      for (const msg of pending) {
        try {
          const res = await fetch(chatEndpoint!, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
            body: JSON.stringify({ id: msg.id, message: msg.message, timestamp: msg.timestamp }),
            keepalive: true,
          });
          if (!res.ok) throw new Error(`chat archive POST failed: ${res.status}`);
        } catch (error) {
          console.error("[chat-archive] failed to archive message", error);
          sentIds.current.delete(msg.id);
        }
      }
    }
    archive();
  }, [chatMessages, chatEndpoint, room]);

  return null;
}

/** "4:59" / "0:07" — always minutes:seconds, no hours (recording limits are short, per-minute at most). */
function formatSecondsRemaining(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/**
 * Countdown shown while recording is active (Quick Video Recording &
 * Sharing initiative) — only rendered when the caller passed
 * maxRecordingSeconds (today, only the quick-recording screen does; a
 * regular scheduled meeting/event recording has no limit, so this is
 * effectively quick-recording-only — see QuickRecordingOverlay, its sole
 * caller). Ticks down locally from `recording`'s true transition,
 * independent of the actual egress duration — good enough given the short
 * limits this is for, and avoids needing a server-supplied start
 * timestamp. Sized up at `sm:`+ (its own status row, above the button row
 * in QuickRecordingOverlay) but stays compact below `sm`, where it shares
 * a single row with the buttons — see QuickRecordingOverlay's doc comment.
 */
function RecordingCountdown({ secondsRemaining }: { secondsRemaining: number }) {
  return (
    <span className="pointer-events-auto rounded-lg bg-[#1d1d1d] px-2.5 py-1 font-mono text-sm text-white/90 tabular-nums sm:px-3 sm:py-1.5 sm:text-xl">
      {formatSecondsRemaining(secondsRemaining)}
    </span>
  );
}

/**
 * Reset button (Quick Video Recording & Sharing initiative, quick-recording
 * only) — rendered in QuickRecordingOverlay's button row next to Record,
 * only while `recording` is true (caller gates this). Discards the
 * in-progress recording without disconnecting — see LiveKitMeetingScreen's
 * handleReset for the actual discard-endpoint call and the ref-flag
 * dance that keeps it from also triggering onRecordingStopped's
 * navigation.
 */
function ResetControl({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`pointer-events-auto ${LK_BUTTON_CLASS}`}
    >
      <RotateCcw className="h-4 w-4" />
      <span className="hidden sm:inline">Reset</span>
    </button>
  );
}

/**
 * Exit button (quick-recording only) — behaves exactly like LiveKit's own
 * (hidden, in this mode) Leave button: a plain room.disconnect(), which
 * `<LiveKitRoom onDisconnected>` already turns into the same backHref
 * navigation Leave always produced. No discard/confirmation logic.
 */
function ExitControl({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`pointer-events-auto ${LK_BUTTON_CLASS}`}>
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Exit</span>
    </button>
  );
}

/**
 * Headless bridge reporting the live Room instance up to the Exit button,
 * which (like RecordingControl/ParticipantsControl) renders outside
 * <LiveKitRoom>'s own DOM tree and so can't call useRoomContext() itself —
 * same structural pattern as RecordingStateListener/ParticipantsListener/
 * CoHostStateListener above.
 */
function RoomExitBridge({ onRoomReady }: { onRoomReady: (room: Room) => void }) {
  const room = useRoomContext();

  useEffect(() => {
    onRoomReady(room);
  }, [room, onRoomReady]);

  return null;
}

/**
 * Record/Stop button — rendered inside TopLeftOverlay below, not
 * independently positioned. Originally bottom-right (reported 2026-08-25:
 * collided with LiveKit's own `.lk-control-bar`, whose Chat toggle is its
 * right-most button with no flex-wrap to make room), then moved to
 * top-right — still wrong (reported 2026-08-26): `.lk-chat` is a full-
 * height sidebar the whole right edge, not just the bottom, so it collided
 * whenever the chat panel was open. The right edge is never a safe zone
 * while chat can be open; the left edge always is. `recording` reflects
 * the live room-metadata-synced state from RecordingStateListener, not
 * local optimistic state, so the button always shows the true shared state
 * even if someone else started/stopped it.
 */
function RecordingControl({
  recording,
  startEndpoint,
  stopEndpoint,
  onError,
}: {
  recording: boolean;
  startEndpoint: string;
  stopEndpoint: string;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(recording ? stopEndpoint : startEndpoint, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        onError(typeof payload?.error === "string" ? payload.error : "Couldn't update recording. Try again.");
      }
      // On success, the button's own state updates via the room-metadata
      // broadcast (RecordingStateListener), not this response directly —
      // keeps this client in sync the exact same way every other client is.
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={recording}
      className={`pointer-events-auto ${LK_BUTTON_CLASS} ${recording ? LK_BUTTON_ACTIVE_CLASS : ""}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${recording ? "animate-pulse bg-red-500" : "bg-white/50"}`} />
      <span className="hidden sm:inline">{recording ? "Stop recording" : "Record"}</span>
    </button>
  );
}

/**
 * A guest identity is only ever `guest-<uuid>` (anonymous open-event
 * attendee — see app/api/events/[id]/meeting/token/route.ts), never a real
 * User.id — so it can never be a co-host and must never show the control
 * (acceptance criterion, Recording Access initiative).
 */
function isGuestIdentity(identity: string): boolean {
  return identity.startsWith("guest-");
}

/**
 * One row of the participant list. Host: fixed badge, never interactive
 * (host isn't a co-host, isn't demotable here). Everyone else: an
 * interactive checkbox if the *viewer* is host/co-host (they're the ones
 * allowed to grant/revoke — enforced again server-side in setEventCoHost,
 * this is only the UI-level gate), a read-only badge otherwise. Guests
 * never get any co-host affordance at all.
 */
function ParticipantRow({
  participant,
  viewerIsHostOrCoHost,
  coHostsEndpoint,
  canKick,
  kickEndpoint,
  onError,
}: {
  participant: ParticipantSummary;
  viewerIsHostOrCoHost: boolean;
  coHostsEndpoint: string | null | undefined;
  /** Whether the *viewer* may remove others — Event: host or co-host; MeetingRequest: sender/organizer only (see LiveKitMeetingScreen's doc comment on why this is separate from viewerIsHostOrCoHost). */
  canKick: boolean;
  kickEndpoint: string | null | undefined;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [kicking, setKicking] = useState(false);

  async function toggleCoHost(next: boolean) {
    if (!coHostsEndpoint) return;
    setPending(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(coHostsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ userId: participant.identity, isCoHost: next }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        onError(typeof payload?.error === "string" ? payload.error : "Couldn't update co-host status. Try again.");
      }
      // On success, every client's badge (including this one) updates via
      // the room-metadata broadcast (CoHostStateListener), not this
      // response directly — same pattern as RecordingControl.toggle.
    } finally {
      setPending(false);
    }
  }

  async function kick() {
    if (!kickEndpoint) return;
    if (!window.confirm(`Remove ${participant.name} from the meeting?`)) return;
    setKicking(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(kickEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ identity: participant.identity }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        onError(typeof payload?.error === "string" ? payload.error : "Couldn't remove that participant. Try again.");
      }
      // On success, no local update is needed here — LiveKit's own
      // ParticipantDisconnected event (ParticipantActivityListener) and
      // useParticipants() (ParticipantsListener) already update everyone's
      // roster the same way an organic departure would.
    } finally {
      setKicking(false);
    }
  }

  const showKick = canKick && kickEndpoint && !participant.isHost && !participant.isLocal;

  return (
    <li className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-sm">
      <span className="truncate">
        {participant.name}
        {participant.isLocal && <span className="text-white/50"> (You)</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {participant.isHost ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">Host</span>
        ) : isGuestIdentity(participant.identity) ? null : viewerIsHostOrCoHost && coHostsEndpoint ? (
          <label className="flex items-center gap-1.5 text-xs font-medium text-white/70">
            <input
              type="checkbox"
              checked={participant.isCoHost}
              disabled={pending}
              onChange={(e) => toggleCoHost(e.target.checked)}
            />
            Co-host
          </label>
        ) : participant.isCoHost ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">Co-host</span>
        ) : null}
        {showKick && (
          <button
            type="button"
            onClick={kick}
            disabled={kicking}
            className="font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </span>
    </li>
  );
}

/**
 * Participants button + dropdown list, rendered inside TopLeftOverlay
 * alongside RecordingControl. `participants` comes from ParticipantsListener
 * inside <LiveKitRoom>, same lift-state-up pattern as recording/toasts.
 */
function ParticipantsControl({
  participants,
  viewerIsHostOrCoHost,
  coHostsEndpoint,
  canKick,
  kickEndpoint,
  onError,
}: {
  participants: ParticipantSummary[];
  viewerIsHostOrCoHost: boolean;
  coHostsEndpoint: string | null | undefined;
  canKick: boolean;
  kickEndpoint: string | null | undefined;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-pressed={open}
        className={`${LK_BUTTON_CLASS} ${open ? LK_BUTTON_ACTIVE_CLASS : ""}`}
      >
        <Users className="h-4 w-4" />
        <span className="hidden sm:inline">Participants ({participants.length})</span>
        <span className="sm:hidden">{participants.length}</span>
      </button>
      {open && (
        <div className={`absolute left-0 top-full mt-2 max-h-72 w-64 overflow-y-auto rounded-lg border p-2 shadow-lg ${LK_PANEL_CLASS}`}>
          <ul className="space-y-1">
            {participants.map((p) => (
              <ParticipantRow
                key={p.identity}
                participant={p}
                viewerIsHostOrCoHost={viewerIsHostOrCoHost}
                coHostsEndpoint={coHostsEndpoint}
                canKick={canKick}
                kickEndpoint={kickEndpoint}
                onError={onError}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Shared top-left overlay slot for Record, Participants, and the camera overlay controls (shown while sharing) — see RecordingControl's doc comment for why this corner (never the right, which LiveKit's chat panel can claim). Only used for non-quick-recording meetings — see QuickRecordingOverlay for the quick-recording equivalent (which also carries the camera overlay controls). */
function TopLeftOverlay({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute left-4 top-4 z-50 flex flex-col items-start gap-2">{children}</div>;
}

/**
 * Quick-recording-only replacement for TopLeftOverlay — Record, Reset,
 * the camera overlay controls, and Exit anchored bottom-right, positioned directly above LiveKit's own
 * bottom `.lk-control-bar` rather than overlapping it. Bottom-left was
 * tried first and reported (live testing) to collide with content already
 * occupying that corner — LiveKit's own per-tile participant metadata
 * (name/mic-state overlay) and the native "you're sharing your
 * screen/window" status message during screen share. Bottom-right is clear
 * in quick-recording mode: LiveKit's own bottom-right occupant, the Chat
 * toggle/panel, is hidden entirely here (see the `<LiveKitRoom>`
 * className above).
 *
 * LiveKit's control bar is a fixed single row that never wraps at any
 * viewport width — confirmed via `@livekit/components-styles`'
 * control-bar.css (`display:flex`, no `flex-wrap`, `max-height:
 * var(--lk-control-bar-height)`, 69px in the default theme) — so 69px is
 * hardcoded below rather than read from that CSS variable, which wouldn't
 * cascade here anyway (this overlay is a sibling of `<LiveKitRoom>`, which
 * is where the theme scopes it).
 *
 * Row count is achieved purely by flex-direction, not duplicated markup:
 * below `sm` the outer wrapper is `flex-row` (countdown + button row sit
 * side by side, wrapping as needed) — one combined row here, plus LiveKit's
 * own single row below it, is 2 rows total in the bottom control region on
 * mobile. At `sm:`+ the wrapper switches to `flex-col`, stacking the
 * countdown above the button row (both right-aligned) — 2 rows here, 3
 * total with LiveKit's bar.
 */
function QuickRecordingOverlay({
  recording,
  secondsRemaining,
  isHostOrCoHost,
  startEndpoint,
  stopEndpoint,
  resetPending,
  onReset,
  onExit,
  onError,
  room,
}: {
  recording: boolean;
  secondsRemaining: number | null;
  isHostOrCoHost: boolean;
  startEndpoint: string;
  stopEndpoint: string;
  resetPending: boolean;
  onReset: () => void;
  onExit: () => void;
  onError: (message: string) => void;
  room: Room | null;
}) {
  return (
    <div
      className="pointer-events-none absolute right-4 z-50 flex flex-row flex-wrap items-center justify-end gap-2 sm:flex-col sm:items-end"
      style={{ bottom: "calc(69px + 0.5rem)" }}
    >
      {recording && secondsRemaining !== null && <RecordingCountdown secondsRemaining={secondsRemaining} />}
      <div className="pointer-events-none flex items-center gap-2">
        {isHostOrCoHost && (
          <RecordingControl recording={recording} startEndpoint={startEndpoint} stopEndpoint={stopEndpoint} onError={onError} />
        )}
        {recording && <ResetControl pending={resetPending} onClick={onReset} />}
        <PresenterOverlayControl room={room} onError={onError} panelPlacement="above-right" />
        <ExitControl onClick={onExit} />
      </div>
    </div>
  );
}

/** The visible toast stack — a sibling of <LiveKitRoom>, not nested inside it (see ParticipantActivityListener). */
function ParticipantActivityToasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="rounded-md bg-foreground/90 px-3 py-2 text-sm text-background shadow-lg">
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/**
 * Full-viewport embedded LiveKit call, rendered by MeetingWaitingRoom once
 * a LiveKit-backed Event/MeetingRequest's meeting has started (LiveKit
 * Meeting Infrastructure initiative). Fetches a join token server-side —
 * the LiveKit API secret never reaches the client — then renders the
 * prefab VideoConference with a title/host banner and join/leave alerts.
 *
 * The banner, disclaimer flash, and toast stack are all rendered as
 * absolutely-positioned overlays *outside* <LiveKitRoom>'s own children,
 * layered on top of it via the shared `fixed inset-0` wrapper below.
 *
 * The wrapper's z-index must clear `components/scroll-header.tsx`'s
 * persistent site header (`sticky top-0 z-50`) — confirmed via live
 * Playwright testing (2026-08-24) that a `z-40` wrapper here renders
 * genuinely visible-per-computed-style content that is nonetheless
 * painted *underneath* the header, since the header establishes its own
 * stacking context and 50 > 40 there; this page is rendered inside the
 * normal `(member)` layout, so the header is always present in the DOM
 * above it. (@livekit/components-styles itself has only one z-index rule
 * in the entire package, `.lk-device-menu` at z-index:5 — it is not the
 * competing layer.) Kept comfortably above 50 (`z-[60]`) rather than
 * exactly 51, so a future header bump doesn't silently reopen this.
 */
export function LiveKitMeetingScreen({
  tokenEndpoint,
  recordingStartEndpoint,
  recordingStopEndpoint,
  coHostsEndpoint,
  kickEndpoint,
  chatEndpoint,
  title,
  organizerName,
  hostId,
  isHostOrCoHost,
  canKick,
  backHref,
  maxRecordingSeconds,
  onRecordingStopped,
  recordingDiscardEndpoint,
}: {
  tokenEndpoint: string;
  /** POST endpoints for the Record/Stop control — host/co-host only (Recording Access initiative; previously any attendee), same auth as tokenEndpoint. */
  recordingStartEndpoint: string;
  recordingStopEndpoint: string;
  /** POST endpoint for granting/revoking co-host — undefined/null for a MeetingRequest, which has no co-host concept (see TopLeftOverlay usage below). */
  coHostsEndpoint?: string | null;
  /** POST endpoint to force-disconnect a participant — Event: host/co-host; MeetingRequest: sender/organizer only, both enforced server-side (see canKick). */
  kickEndpoint?: string | null;
  /** POST endpoint for archiving this participant's own chat messages (LiveKit meeting chat archival) — null/undefined for a MeetingRequest, which has no discussion thread to archive into. */
  chatEndpoint?: string | null;
  title: string;
  organizerName: string;
  /** Event.hostId, matching the LiveKit identity a host's token is minted with — undefined for a MeetingRequest (no host/co-host concept there). */
  hostId?: string;
  /**
   * Whether the *viewer* is allowed to record. Gates the Record button
   * directly; the co-host checkbox is additionally gated on coHostsEndpoint
   * being present (see ParticipantRow), since a MeetingRequest has no
   * co-host concept even though its recording is open to both parties
   * (meeting-waiting-room.tsx defaults this to `true` for a MeetingRequest,
   * matching its recording routes' intentionally-unrestricted policy —
   * bug fixed 2026-08-26, previously defaulted to `false` there and hid
   * the Record button for every MeetingRequest participant).
   */
  isHostOrCoHost: boolean;
  /**
   * Whether the *viewer* is allowed to remove other participants. Kept
   * distinct from isHostOrCoHost: for a MeetingRequest, isHostOrCoHost is
   * deliberately true for both parties (unrestricted recording), but
   * kicking must stay organizer-only there — meeting-waiting-room.tsx
   * computes this as `status.isHostOrCoHost ?? status.isOrganizer`, which
   * is the real per-viewer host-or-co-host boolean for an Event and falls
   * back to sender-only for a MeetingRequest (no isHostOrCoHost field).
   */
  canKick: boolean;
  /** Where to navigate once the participant leaves the call (VideoConference's built-in Leave button, or a connection drop) — same destination the page's own BackLink uses. */
  backHref: string;
  /** Admin-configurable recording time limit (Quick Video Recording & Sharing initiative) — undefined means no limit (every caller except the quick-recording screen), which skips the countdown UI and auto-stop entirely. */
  maxRecordingSeconds?: number;
  /** Fires on any recording→not-recording transition (manual Stop or the countdown auto-stop) — never on initial mount. Only the quick-recording screen passes this, to navigate to its processing/done page. Deliberately does NOT fire for a Reset-triggered stop — see handleReset's resettingRef. */
  onRecordingStopped?: () => void;
  /** POST endpoint for the Reset button (quick-recording only) — always provided together with maxRecordingSeconds by the one caller (QuickRecordingMeetingScreen) that sets isQuickRecording true; unused, and Reset never renders, otherwise. */
  recordingDiscardEndpoint?: string;
}) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ token: string; serverUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recording, setRecording] = useState(false);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [coHostUserIds, setCoHostUserIds] = useState<string[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const wasRecordingRef = useRef(false);
  // Set right before calling the discard endpoint (handleReset), checked
  // instead of firing onRecordingStopped in the recording-transition effect
  // below — distinguishes a Reset-triggered stop (stay in the room, ready
  // to record again) from a real Stop (navigate to the done page).
  const resettingRef = useRef(false);

  const isQuickRecording = maxRecordingSeconds !== undefined;

  usePreventScreenShareSelfMirror();

  // Countdown + auto-stop (Quick Video Recording & Sharing initiative) —
  // primary, client-side enforcement of maxRecordingSeconds; the
  // recording/start route additionally schedules an independent
  // server-side backstop for the case this tab goes idle and the interval
  // below never fires. Also fires onRecordingStopped on every
  // recording→not-recording transition, whether via this auto-stop or a
  // manual Stop click (both surface identically through `recording`,
  // which mirrors the room's own metadata — see RecordingStateListener).
  useEffect(() => {
    if (recording) {
      if (!wasRecordingRef.current) setSecondsRemaining(maxRecordingSeconds ?? null);
      wasRecordingRef.current = true;
      return;
    }
    if (wasRecordingRef.current) {
      if (resettingRef.current) {
        resettingRef.current = false;
      } else {
        onRecordingStopped?.();
      }
    }
    wasRecordingRef.current = false;
    setSecondsRemaining(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => {
    if (secondsRemaining === null) return;
    if (secondsRemaining <= 0) {
      (async () => {
        try {
          const csrfToken = await getCsrfToken();
          await fetch(recordingStopEndpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } });
        } catch (err) {
          console.error("[livekit] Failed to auto-stop recording at the time limit", err);
        }
      })();
      return;
    }
    const timer = setTimeout(() => setSecondsRemaining((current) => (current === null ? null : current - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsRemaining, recordingStopEndpoint]);

  useEffect(() => {
    let cancelled = false;
    async function fetchToken() {
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(tokenEndpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't connect to the meeting.");
        }
        const data = await res.json();
        if (!cancelled) setCredentials(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't connect to the meeting.");
      }
    }
    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [tokenEndpoint]);

  function pushToast(message: string) {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), TOAST_DURATION_MS);
  }

  /**
   * Reset button (quick-recording only): discards the in-progress
   * recording via recordingDiscardEndpoint (POST .../recording/discard —
   * stops the egress and soft-deletes the MeetingRequestRecording row
   * server-side) without disconnecting or navigating away. resettingRef is
   * set before the request so the recording-transition effect above skips
   * onRecordingStopped for the resulting recording->false transition; it's
   * reset back to false again on any failure, so a subsequent real Stop
   * still navigates normally.
   */
  async function handleReset() {
    if (!recordingDiscardEndpoint) return;
    resettingRef.current = true;
    setResetPending(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(recordingDiscardEndpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } });
      if (!res.ok) {
        resettingRef.current = false;
        const payload = await res.json().catch(() => null);
        pushToast(typeof payload?.error === "string" ? payload.error : "Couldn't reset. Try again.");
      }
      // On success, `recording` flips to false via the same room-metadata
      // broadcast (RecordingStateListener) every other transition uses.
    } catch {
      resettingRef.current = false;
      pushToast("Couldn't reset. Try again.");
    } finally {
      setResetPending(false);
    }
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background p-8 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background p-8 text-center">
        <p className="text-muted-foreground">Connecting…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-background">
      <MeetingBanner title={title} organizerName={organizerName} />
      <DisclaimerReminderFlash isQuickRecording={isQuickRecording} />
      <ParticipantActivityToasts toasts={toasts} />
      {isQuickRecording ? (
        <QuickRecordingOverlay
          recording={recording}
          secondsRemaining={secondsRemaining}
          isHostOrCoHost={isHostOrCoHost}
          startEndpoint={recordingStartEndpoint}
          stopEndpoint={recordingStopEndpoint}
          resetPending={resetPending}
          onReset={handleReset}
          onExit={() => room?.disconnect()}
          room={room}
          onError={pushToast}
        />
      ) : (
        <TopLeftOverlay>
          {isHostOrCoHost && (
            <RecordingControl
              recording={recording}
              startEndpoint={recordingStartEndpoint}
              stopEndpoint={recordingStopEndpoint}
              onError={pushToast}
            />
          )}
          <ParticipantsControl
            participants={participants}
            viewerIsHostOrCoHost={isHostOrCoHost}
            coHostsEndpoint={coHostsEndpoint}
            canKick={canKick}
            kickEndpoint={kickEndpoint}
            onError={pushToast}
          />
          <PresenterOverlayControl room={room} onError={pushToast} />
        </TopLeftOverlay>
      )}
      <LiveKitRoom
        token={credentials.token}
        serverUrl={credentials.serverUrl}
        connect
        options={ROOM_OPTIONS}
        data-lk-theme="default"
        style={{ height: "100%" }}
        // Quick-recording only: hides LiveKit's own Chat toggle and Leave
        // button (stable classes confirmed in @livekit/components-styles),
        // both replaced by this mode's own Exit button / removed entirely
        // (Chat has no replacement — see the objective's rationale).
        className={isQuickRecording ? "[&_.lk-chat-toggle]:hidden [&_.lk-disconnect-button]:hidden" : undefined}
        // replace, not push — the meeting page (this same URL) is already
        // the current history entry; pushing on top of it left it reachable
        // via the browser Back button, which would land back on a still-
        // `started` meeting and immediately reconnect (reported 2026-08-25).
        onDisconnected={() => router.replace(backHref)}
      >
        <ParticipantActivityListener onEvent={pushToast} />
        <RecordingStateListener onChange={setRecording} onToast={pushToast} />
        <CoHostStateListener onChange={setCoHostUserIds} />
        <ChatCaptureListener chatEndpoint={chatEndpoint} />
        <ParticipantsListener hostId={hostId} coHostUserIds={coHostUserIds} onChange={setParticipants} />
        <RoomExitBridge onRoomReady={setRoom} />
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
