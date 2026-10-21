"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, RotateCcw, Users, X } from "lucide-react";
import { ConnectionState, DisconnectReason, RoomEvent, VideoPreset, VideoPresets, type RemoteParticipant, type Room } from "livekit-client";
import { LiveKitRoom, useChat, useConnectionState, useLocalParticipant, useParticipants, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { getCsrfToken } from "@/lib/csrf-client";
import { getPublicMeetingClosingNote } from "@/lib/legal";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/calendar/livekit-control-styles";
import { PresenterOverlayControl } from "@/components/calendar/presenter-overlay-control";
import { OverlayGuestControl } from "@/components/calendar/overlay-guest-control";
import { BAR_CLEARANCE_VAR, ShareStage } from "@/components/calendar/share-stage";
import { BackgroundControl } from "@/components/calendar/background-control";
import { ReactionsControl, ReactionsOverlay, useReactions } from "@/components/calendar/reactions";
import { RaiseHandControl, RaisedHandsQueue, playHandChime, useRaisedHands } from "@/components/calendar/raise-hand";
import { AWAY_ATTR, useAwayPresence, useScreenWakeLock } from "@/components/calendar/meeting-presence";

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
  /** Raise hand is up — read from the participant's `handRaised` attribute (components/calendar/raise-hand.tsx). */
  handRaised: boolean;
  /** Their meeting page is in the background — read from the participant's `away` attribute (components/calendar/meeting-presence.ts). */
  away: boolean;
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
        handRaised: p.attributes?.handRaised === "1",
        away: p.attributes?.[AWAY_ATTR] === "1",
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
 *
 * "Left" is held for LEAVE_TOAST_GRACE_MS: a phone that drops out while its
 * meeting page is in the background rejoins as soon as it's back (see
 * LiveKitMeetingScreen's rejoin handling), and announcing every such blip as
 * a left/joined pair would spam everyone else. A rejoin within the window
 * cancels the pending "left" and is itself silent.
 */
const LEAVE_TOAST_GRACE_MS = 30_000;

function ParticipantActivityListener({ onEvent }: { onEvent: (message: string) => void }) {
  const room = useRoomContext();
  // A ref, not an effect dependency: the caller passes a fresh function every render, and re-running the
  // effect would clear the pending "left" timers below.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const onEvent = (message: string) => onEventRef.current(message);
    const pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();

    function onConnected(participant: RemoteParticipant) {
      const pending = pendingLeaves.get(participant.identity);
      if (pending) {
        clearTimeout(pending);
        pendingLeaves.delete(participant.identity);
        return;
      }
      onEvent(`${participant.name || participant.identity} joined`);
    }
    function onDisconnected(participant: RemoteParticipant) {
      const message = `${participant.name || participant.identity} left`;
      clearTimeout(pendingLeaves.get(participant.identity));
      pendingLeaves.set(
        participant.identity,
        setTimeout(() => {
          pendingLeaves.delete(participant.identity);
          onEvent(message);
        }, LEAVE_TOAST_GRACE_MS),
      );
    }
    room.on(RoomEvent.ParticipantConnected, onConnected);
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onConnected);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
      pendingLeaves.forEach((timer) => clearTimeout(timer));
    };
  }, [room]);

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
        {participant.away && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">Away</span>
        )}
        {participant.handRaised && (
          <span role="img" aria-label="Hand raised" title="Hand raised" className="text-base leading-none">
            ✋
          </span>
        )}
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

/** How long a floating control cluster sits untouched before it fades, so it stops permanently eclipsing whatever it's drawn on top of (a participant tile, in both places this is used). */
const IDLE_FADE_MS = 3000;

/**
 * Fades a floating control cluster to low opacity after IDLE_FADE_MS of no hover/focus, snapping straight back
 * (and cancelling the fade) on interaction. Spread the returned handlers onto the cluster's own wrapper, which
 * must stay `pointer-events-none` itself with only its buttons interactive: moving off a button into a real gap
 * is hit-tested as leaving the wrapper entirely (the gap passes through to whatever's underneath), which is
 * what actually starts the fade — hovering or focusing (mouse or keyboard) any child button bubbles back up
 * and wakes it.
 */
function useIdleFade(idleMs: number = IDLE_FADE_MS) {
  const [active, setActive] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function wake() {
    setActive(true);
    if (timer.current) clearTimeout(timer.current);
  }

  function scheduleFade() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), idleMs);
  }

  useEffect(() => {
    scheduleFade();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { active, onMouseEnter: wake, onMouseLeave: scheduleFade, onFocus: wake, onBlur: scheduleFade };
}

/**
 * Shared top-left overlay slot for Record, Participants, and the camera overlay controls (shown while sharing) —
 * see RecordingControl's doc comment for why this corner (never the right, which LiveKit's chat panel can
 * claim). Only used for non-quick-recording meetings — see QuickRecordingOverlay for the quick-recording
 * equivalent (which also carries the camera overlay controls, and fades the same way).
 */
function TopLeftOverlay({ children }: { children: ReactNode }) {
  const { active, ...fade } = useIdleFade();

  return (
    <div
      {...fade}
      className={`pointer-events-none absolute left-4 top-4 z-50 flex flex-col items-start gap-2 transition-opacity duration-500 ${active ? "opacity-100" : "opacity-30"}`}
    >
      {children}
    </div>
  );
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
 * The offset comes from ShareStage's BAR_CLEARANCE_VAR, the bar row's measured
 * distance from the bottom of the screen: one 69px row (`--lk-control-bar-height` in the default theme) on
 * most screens, but two in portrait, where the full icon-only bar is wider
 * than the phone and wraps. 69px is the fallback before the first measure.
 *
 * Row count is achieved purely by flex-direction, not duplicated markup:
 * below `sm` the outer wrapper is `flex-row` (countdown + button row sit
 * side by side, wrapping as needed) — one combined row here, plus LiveKit's
 * own single row below it, is 2 rows total in the bottom control region on
 * mobile. At `sm:`+ the wrapper switches to `flex-col`, stacking the
 * countdown above the button row (both right-aligned) — 2 rows here, 3
 * total with LiveKit's bar.
 *
 * The button row (not the countdown, which stays fully visible as useful status even while idle) fades the
 * same way TopLeftOverlay's cluster does — see useIdleFade.
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
  onOverlayIds,
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
  onOverlayIds: (ids: string[]) => void;
}) {
  const { active, ...fade } = useIdleFade();

  return (
    <div
      className="pointer-events-none absolute right-4 z-50 flex flex-row flex-wrap items-center justify-end gap-2 sm:flex-col sm:items-end"
      style={{ bottom: `calc(var(${BAR_CLEARANCE_VAR}, 69px) + 0.5rem)` }}
    >
      {recording && secondsRemaining !== null && <RecordingCountdown secondsRemaining={secondsRemaining} />}
      <div {...fade} className={`pointer-events-none flex items-center gap-2 transition-opacity duration-500 ${active ? "opacity-100" : "opacity-30"}`}>
        {isHostOrCoHost && (
          <RecordingControl recording={recording} startEndpoint={startEndpoint} stopEndpoint={stopEndpoint} onError={onError} />
        )}
        {recording && <ResetControl pending={resetPending} onClick={onReset} />}
        <PresenterOverlayControl room={room} onError={onError} onOverlayIds={onOverlayIds} panelPlacement="above-right" />
        <OverlayGuestControl room={room} onOverlayIds={onOverlayIds} />
        <ExitControl onClick={onExit} />
      </div>
    </div>
  );
}

/**
 * Disconnects that end the meeting for this viewer — they navigate back to
 * the event page exactly as before. Anything else (a dropped signal
 * connection, a timeout, a server restart, or a phone freezing the page
 * while it's in the background) is rejoined instead. DUPLICATE_IDENTITY is
 * the same person opening the meeting in another tab or device; rejoining
 * from here would just kick that one out in turn.
 */
const FINAL_DISCONNECT_REASONS = new Set<DisconnectReason>([
  DisconnectReason.CLIENT_INITIATED,
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.ROOM_CLOSED,
  DisconnectReason.DUPLICATE_IDENTITY,
  DisconnectReason.USER_REJECTED,
]);

/**
 * After the page comes back to the foreground, how long LiveKit's own reconnect gets before we rejoin instead.
 * A phone that froze the page for a minute has usually been dropped by the server already, so LiveKit's resume
 * attempts can't succeed — but its retry loop takes ~50s to give up, all of it spent on a "Reconnecting" notice.
 */
const STUCK_RECONNECT_MS = 5_000;

/** Wait before each retry after a failed rejoin; once these run out the viewer gets a Try again button. */
const REJOIN_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000];

/**
 * idle: connected (or connecting for the first time). waiting: dropped, waiting for the page to be visible and
 * online (and for any retry delay). connecting: fetching a fresh token and connecting a new room. failed: gave up.
 */
type RejoinState = "idle" | "waiting" | "connecting" | "failed";

type LocalMedia = { microphone: boolean; camera: boolean };

/**
 * Headless (inside <LiveKitRoom>, same pattern as ParticipantsListener) — reports whether the viewer's mic and
 * camera are on while connected, so they can be turned back on after a rejoin, and does that turning-back-on
 * once this room connects when `restore` is set. The parent only keeps reports made while the page is visible:
 * a phone stops the camera (iOS usually the mic too) as soon as the page goes to the background, and that must
 * not be mistaken for the viewer switching them off.
 */
function LocalMediaListener({
  restore,
  onChange,
  onError,
}: {
  restore: LocalMedia | null;
  onChange: (media: LocalMedia) => void;
  onError: (message: string) => void;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const connectionState = useConnectionState();
  const restoredRef = useRef(false);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) onChange({ microphone: isMicrophoneEnabled, camera: isCameraEnabled });
  }, [connectionState, isMicrophoneEnabled, isCameraEnabled, onChange]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || !restore || restoredRef.current) return;
    restoredRef.current = true;
    if (restore.microphone) {
      localParticipant.setMicrophoneEnabled(true).catch(() => onError("Couldn't turn your microphone back on."));
    }
    if (restore.camera) {
      localParticipant.setCameraEnabled(true).catch(() => onError("Couldn't turn your camera back on."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState, restore]);

  return null;
}

/** Covers the call while it's being rejoined — the old room is gone, so without this the screen would just go blank. */
function RejoinOverlay({ failed, onRetry, onLeave }: { failed: boolean; onRetry: () => void; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div role="status" aria-live="polite" className={`w-full max-w-sm rounded-lg border p-6 text-center shadow-lg ${LK_PANEL_CLASS}`}>
        <p className="font-semibold">{failed ? "Couldn't reconnect to the meeting" : "Reconnecting…"}</p>
        <p className="mt-1 text-sm text-white/70">
          {failed ? "Check your connection, then try again." : "Your connection dropped. You'll be back in the meeting in a moment."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {failed && (
            <button type="button" onClick={onRetry} className={`${LK_BUTTON_CLASS} ${LK_BUTTON_ACTIVE_CLASS}`}>
              Try again
            </button>
          )}
          <button type="button" onClick={onLeave} className={`${LK_BUTTON_CLASS} border border-white/10`}>
            <LogOut className="h-4 w-4" />
            Leave
          </button>
        </div>
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
  lowerHandEndpoint,
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
  /** POST endpoint for a host/co-host to lower someone else's raised hand — its presence is what enables the raise-hand feature (Events only; null/undefined for a MeetingRequest and quick recordings). */
  lowerHandEndpoint?: string | null;
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
  // Identities whose camera is on the presenter overlay; their camera tiles are hidden (see ShareStage).
  const [overlayIds, setOverlayIds] = useState<string[]>([]);
  const [handAnnouncement, setHandAnnouncement] = useState("");
  const [rejoin, setRejoin] = useState<RejoinState>("idle");
  // Read by LiveKit's event callbacks, which can fire between a state update and the re-render that follows it.
  const rejoinRef = useRef<RejoinState>("idle");
  const rejoinFailuresRef = useRef(0);
  // Bumped on each rejoin to mount a fresh <LiveKitRoom> (and Room) rather than reuse the disconnected one.
  const [roomKey, setRoomKey] = useState(0);
  const roomRef = useRef<Room | null>(null);
  // Last mic/camera state seen while visible and connected, and the one to restore after the current rejoin.
  const mediaSnapshotRef = useRef<LocalMedia>({ microphone: false, camera: false });
  const [restoreMedia, setRestoreMedia] = useState<LocalMedia | null>(null);
  const handleLocalMedia = useCallback((media: LocalMedia) => {
    if (document.visibilityState === "visible") mediaSnapshotRef.current = media;
  }, []);
  const wasRecordingRef = useRef(false);
  // Set right before calling the discard endpoint (handleReset), checked
  // instead of firing onRecordingStopped in the recording-transition effect
  // below — distinguishes a Reset-triggered stop (stay in the room, ready
  // to record again) from a real Stop (navigate to the done page).
  const resettingRef = useRef(false);

  const isQuickRecording = maxRecordingSeconds !== undefined;

  usePreventScreenShareSelfMirror();
  useScreenWakeLock();
  useAwayPresence(room);

  const raiseHandEnabled = !isQuickRecording && !!lowerHandEndpoint;
  // Only the host/co-host is told when someone else raises a hand — everyone else just sees the badge.
  const raisedHands = useRaisedHands(
    raiseHandEnabled ? room : null,
    isHostOrCoHost
      ? (hand) => {
          const message = `${hand.name} raised a hand`;
          pushToast(message);
          setHandAnnouncement(message);
          playHandChime();
        }
      : undefined,
  );
  const ownHandRaised = raisedHands.some((hand) => hand.isLocal);
  // Same Events-only gate as raise hand.
  const reactions = useReactions(room, raiseHandEnabled);

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

  // The page behind this full-screen call stays scrollable otherwise, and a swipe on the call scrolls it —
  // which is what makes a mobile browser's address bar slide in and out over the control bar.
  useEffect(() => {
    const html = document.documentElement;
    const previous = [html.style.overflow, document.body.style.overflow, html.style.overscrollBehavior];
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    return () => {
      [html.style.overflow, document.body.style.overflow, html.style.overscrollBehavior] = previous;
    };
  }, []);

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

  function updateRejoin(next: RejoinState) {
    rejoinRef.current = next;
    setRejoin(next);
  }

  function handleRoomReady(next: Room) {
    roomRef.current = next;
    setRoom(next);
  }

  /**
   * Replaces the old `onDisconnected={() => router.replace(backHref)}`, which sent the viewer back to the event
   * page on *any* disconnect — including a phone freezing the page while it was in the background, where
   * LiveKit's own reconnect can't succeed (reported 2026-10-21). Only FINAL_DISCONNECT_REASONS still do that.
   */
  function handleDisconnected(reason?: DisconnectReason) {
    if (reason !== undefined && FINAL_DISCONNECT_REASONS.has(reason)) {
      router.replace(backHref);
      return;
    }
    // Only this screen disconnects a room itself, so a client-initiated disconnect mid-rejoin is the old,
    // already-dropped room being cleaned up — not the viewer leaving (they leave via the overlay's button).
    if (rejoinRef.current !== "idle" && reason === DisconnectReason.CLIENT_INITIATED) return;
    if (rejoinRef.current === "connecting") {
      handleRejoinFailed();
      return;
    }
    if (rejoinRef.current !== "idle") return;
    startRejoin();
  }

  function startRejoin() {
    setRestoreMedia(mediaSnapshotRef.current);
    rejoinFailuresRef.current = 0;
    updateRejoin("waiting");
  }

  // Back in the foreground but LiveKit is still trying to resume the old session: give it STUCK_RECONNECT_MS,
  // then abandon it and rejoin. The old room is unmounted (and so disconnected) by the remount.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onVisibilityChange() {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        const state = roomRef.current?.state;
        const stuck = state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting;
        if (stuck && rejoinRef.current === "idle") startRejoin();
      }, STUCK_RECONNECT_MS);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRejoinFailed() {
    if (rejoinRef.current !== "connecting") return;
    rejoinFailuresRef.current += 1;
    updateRejoin(rejoinFailuresRef.current > REJOIN_RETRY_DELAYS_MS.length ? "failed" : "waiting");
  }

  // Stable on purpose: <LiveKitRoom> re-runs its connect effect whenever its onError prop changes identity.
  const handleRoomError = useCallback((err: Error) => {
    if (rejoinRef.current !== "connecting") return;
    console.warn("[livekit] Rejoin connect failed", err);
    handleRejoinFailed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConnected() {
    if (rejoinRef.current === "idle") return;
    rejoinFailuresRef.current = 0;
    updateRejoin("idle");
  }

  // Dropped: wait out any retry delay, then for the page to be visible and online — a phone can't reconnect
  // while it has the page frozen in the background, so there's no point trying before the viewer is back.
  useEffect(() => {
    if (rejoin !== "waiting") return;
    let delayElapsed = false;
    function tryStart() {
      if (delayElapsed && document.visibilityState === "visible" && navigator.onLine) updateRejoin("connecting");
    }
    const failures = rejoinFailuresRef.current;
    const timer = setTimeout(
      () => {
        delayElapsed = true;
        tryStart();
      },
      failures === 0 ? 0 : REJOIN_RETRY_DELAYS_MS[failures - 1],
    );
    document.addEventListener("visibilitychange", tryStart);
    window.addEventListener("online", tryStart);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tryStart);
      window.removeEventListener("online", tryStart);
    };
  }, [rejoin]);

  // A fresh token re-checks that the meeting is still joinable: a 4xx (meeting ended or reset, access revoked)
  // sends the viewer back like a normal leave, while a network error or 5xx is retried. The new room's
  // Connected event (handleConnected) or a failure (handleRejoinFailed) moves things on from here.
  useEffect(() => {
    if (rejoin !== "connecting") return;
    let cancelled = false;
    (async () => {
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(tokenEndpoint, { method: "POST", headers: { "x-csrf-token": csrfToken } });
        if (cancelled) return;
        if (res.status >= 400 && res.status < 500) {
          router.replace(backHref);
          return;
        }
        if (!res.ok) throw new Error(`token POST failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setCredentials(data);
        setRoomKey((key) => key + 1);
      } catch (err) {
        console.warn("[livekit] Rejoin attempt failed", err);
        if (!cancelled) handleRejoinFailed();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejoin, tokenEndpoint]);

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
    // h-dvh rather than inset-0's bottom edge: mobile browsers with a bottom address bar (DuckDuckGo's default)
    // can slide it back over the page — e.g. after the camera permission prompt — without resizing a fixed
    // inset-0 box, hiding the control bar's bottom row behind it (reported 2026-10-21). dvh tracks the bar.
    <div className="fixed inset-x-0 top-0 z-[60] h-dvh bg-background">
      <MeetingBanner title={title} organizerName={organizerName} />
      <DisclaimerReminderFlash isQuickRecording={isQuickRecording} />
      <ParticipantActivityToasts toasts={toasts} />
      {rejoin !== "idle" && (
        <RejoinOverlay
          failed={rejoin === "failed"}
          onRetry={() => {
            rejoinFailuresRef.current = 0;
            updateRejoin("waiting");
          }}
          onLeave={() => router.replace(backHref)}
        />
      )}
      {raiseHandEnabled && <ReactionsOverlay floats={reactions.floats} />}
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
          onOverlayIds={setOverlayIds}
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
          <PresenterOverlayControl room={room} onError={pushToast} onOverlayIds={setOverlayIds} />
          <OverlayGuestControl room={room} onOverlayIds={setOverlayIds} />
        </TopLeftOverlay>
      )}
      {raiseHandEnabled && isHostOrCoHost && lowerHandEndpoint && (
        <RaisedHandsQueue
          room={room}
          hands={raisedHands}
          announcement={handAnnouncement}
          lowerHandEndpoint={lowerHandEndpoint}
          onError={pushToast}
        />
      )}
      <LiveKitRoom
        key={roomKey}
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
        // Leaving uses replace, not push — the meeting page (this same URL)
        // is already the current history entry; pushing on top of it left it
        // reachable via the browser Back button, which would land back on a
        // still-`started` meeting and immediately reconnect (reported
        // 2026-08-25). Transient drops are rejoined — see handleDisconnected.
        onDisconnected={handleDisconnected}
        onConnected={handleConnected}
        onError={handleRoomError}
      >
        <ParticipantActivityListener onEvent={pushToast} />
        <RecordingStateListener onChange={setRecording} onToast={pushToast} />
        <CoHostStateListener onChange={setCoHostUserIds} />
        <ChatCaptureListener chatEndpoint={chatEndpoint} />
        <ParticipantsListener hostId={hostId} coHostUserIds={coHostUserIds} onChange={setParticipants} />
        <RoomExitBridge onRoomReady={handleRoomReady} />
        <LocalMediaListener restore={restoreMedia} onChange={handleLocalMedia} onError={pushToast} />
        <ShareStage
          overlayIds={overlayIds}
          barExtra={
            <>
              {raiseHandEnabled && (
                <>
                  <RaiseHandControl room={room} raised={ownHandRaised} onError={pushToast} inControlBar />
                  <ReactionsControl send={reactions.send} />
                </>
              )}
              <BackgroundControl onError={pushToast} />
            </>
          }
        />
      </LiveKitRoom>
    </div>
  );
}
