"use client";

import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, GripHorizontal, ImagePlus, PictureInPicture2, Presentation, X } from "lucide-react";
import { RoomEvent, Track, type LocalTrackPublication, type LocalVideoTrack, type Room } from "livekit-client";
import type { PanelShape } from "@/lib/presenter-overlay/panel";
import { SpeakerFollower } from "@/lib/presenter-overlay/speaker-follow";
import { CoGhostRoster, MAX_GUEST_GHOSTS, type GuestOverlayState, type JoinPolicy } from "@/lib/presenter-overlay/co-ghosts";
import { OVERLAY_TOPIC, encodeMessage, parseToPresenter, type ToGuest, type ToPresenter } from "@/lib/presenter-overlay/overlay-protocol";
import {
  DRAW_TOPIC,
  GuestPointerBoard,
  POINTER_TOPIC,
  encodePointerMessage,
  parseDrawToHost,
  parsePointerToHost,
  type DrawToGuest,
  type GuestAbility,
  type PointerPolicy,
  type PointerStatus,
  type PointerToGuest,
} from "@/lib/presenter-overlay/guest-pointer";
import {
  isPresenterOverlaySupported,
  isVoicePinSupported,
  startPresenterOverlayCompositor,
  type OverlayCorner,
  type PresenterOverlayCompositor,
  type PresenterOverlaySettings,
} from "@/lib/presenter-overlay/compositor";
import { MAX_TEXT_LENGTH, type PinnedShape } from "@/lib/presenter-overlay/drawing";
import { clampPanelPosition, dragPanelPosition, nudgePanelPosition, parseStoredPanel, serializePanel, type PanelPosition } from "@/lib/presenter-overlay/panel-position";
import { ShapePromptField, ShapeTextPanel, useShapePrompt } from "@/components/shape-text-panel";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/livekit-control-styles";
import {
  ANNOTATION_PRESETS,
  LOOK_PRESETS,
  TRUST_PRESETS,
  presetMatches,
  type AnnotationPresetFields,
  type LookPresetFields,
  type Preset,
  type TrustPresetFields,
} from "@/lib/presenter-overlay/presets";

/** The presenter's own screen share, started with LiveKit's regular Share screen button. */
type Share = {
  publication: LocalTrackPublication;
  track: LocalVideoTrack;
  /** The untouched screen capture — kept so the overlay can be swapped out again. */
  rawScreen: MediaStreamTrack;
};

/** Everything that exists only while the overlay is on. */
type Overlay = {
  compositor: PresenterOverlayCompositor;
  /** The compositor reads a clone, so the raw track stays free to be swapped back in. */
  screenClone: MediaStreamTrack;
  cameraTrack: MediaStreamTrack;
  /** Whether the presenter's regular camera tile was on before the overlay — restored when it's removed. */
  cameraWasEnabled: boolean;
  /** Picks whose cut-out is shown; ticked while the overlay is on. */
  follower: SpeakerFollower;
  tick: ReturnType<typeof setInterval>;
  /** Remote camera sources currently registered with the compositor: participant identity -> the MediaStreamTrack it was built from. */
  attached: Map<string, MediaStreamTrack>;
};

/** A camera the presenter can pin the ghost to. */
type Person = { id: string; label: string };

/** One row of preset buttons in the Presets tab. A button highlights only while every field its preset defines still matches `current`. */
function PresetRow<F extends Record<string, unknown>>({
  title,
  presets,
  current,
  onApply,
  segmentClass,
}: {
  title: string;
  presets: Preset<F>[];
  current: Partial<F>;
  onApply: (fields: F) => void;
  segmentClass: (selected: boolean) => string;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-white/70">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{title}</span>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset.fields)}
            aria-pressed={presetMatches(preset.fields, current)}
            className={`${segmentClass(presetMatches(preset.fields, current))} flex-none`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** How often speech is sampled to decide who the ghost shows. */
const FOLLOW_TICK_MS = 100;
const LOCAL_ID = "local";

/** Chrome 116+ Document Picture-in-Picture — not in TS's DOM lib yet. */
type DocumentPictureInPicture = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
};

function documentPictureInPicture(): DocumentPictureInPicture | undefined {
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
}

/** Pop-out size: a 16:9 preview, grown by PIP_PANEL_HEIGHT while its settings panel is open. */
/** Browser-storage key for where the settings panel was left and whether it is collapsed (best effort). */
const PANEL_STORAGE_KEY = "showup:overlay-panel";
const PIP_WIDTH = 360;
const PIP_HEIGHT = 203;
const PIP_PANEL_HEIGHT = 420;

/**
 * A Document PiP window starts as a blank document — copy this page's
 * stylesheets in so the Tailwind classes on the portaled preview/settings
 * resolve there too. Same-origin sheets are copied rule by rule; any
 * sheet whose rules can't be read (cross-origin) is linked instead.
 */
function copyStyleSheets(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.document.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      target.document.head.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = target.document.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.document.head.appendChild(link);
    }
  }
}

/**
 * LocalTrack.replaceTrack detaches every <video> showing the old track but never attaches the new one,
 * so the presenter's own tile in the meeting (the prefab's) goes black while remote viewers see the
 * swapped track fine. Attaching again points each still-registered element at the new track.
 */
function reattachLocalTiles(track: LocalVideoTrack) {
  for (const element of [...track.attachedElements]) track.attach(element);
}

/**
 * Presenter camera overlay (objective 961a9322) — an add-on to the regular
 * screen share, not a separate way to share. While the presenter is
 * sharing (via LiveKit's own Share screen button), "Add me to the share"
 * swaps the published screen track in place (LocalVideoTrack.replaceTrack)
 * for a combined one: the screen with the presenter's background-removed
 * webcam drawn translucently over it (lib/presenter-overlay/compositor.ts),
 * so they can point at things on their slides. No second picker, and no
 * unpublish/republish, so viewers and the recording see no interruption.
 * Turning it off swaps the untouched full-resolution capture back in and
 * stops the webcam feed and segmentation entirely — "off" is exactly a
 * plain share.
 *
 * Rendered outside <LiveKitRoom> (TopLeftOverlay / QuickRecordingOverlay),
 * so it takes the Room via the RoomExitBridge handoff. Renders nothing on
 * browsers without insertable streams (Firefox, Safari, iOS) — the check
 * runs after mount so SSR/hydration agree — or while nobody's sharing.
 *
 * Ending the share: once the overlay is swapped in, LiveKit is watching
 * the combined track, not the capture, so it no longer notices the
 * browser's own "Stop sharing" bar ending the capture — this component
 * listens for that and unpublishes the share itself. Conversely, when the
 * share is unpublished (ControlBar's toggle, or that path), LiveKit only
 * stops the track it currently holds, so the raw capture is stopped here.
 */
export function PresenterOverlayControl({
  room,
  onError,
  onOverlayIds,
  panelPlacement = "below-left",
}: {
  room: Room | null;
  onError: (message: string) => void;
  /** Called with everyone whose camera is on the overlay (empty when off), so the meeting view can hide their camera tiles. */
  onOverlayIds: (ids: string[]) => void;
  /** Where the settings panel opens: under the button (TopLeftOverlay), or above it for the bottom-right quick-recording controls, which sit right on top of LiveKit's control bar. */
  panelPlacement?: "below-left" | "above-right";
}) {
  const [supported, setSupported] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<"off" | "starting" | "on">("off");
  // Starts collapsed — it sits over the meeting view; the "Overlay settings" button toggles it.
  const [panelOpen, setPanelOpen] = useState(false);
  // The settings panel can be dragged out of the way of the shared screen and folded down to its header.
  // null = the default spot (under or above its button); a position pins it to the window.
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // Which half of the settings panel is showing: one-click bundles, or the full control set.
  const [settingsTab, setSettingsTab] = useState<"presets" | "finetune">("presets");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ origin: PanelPosition; start: { x: number; y: number }; last: PanelPosition } | null>(null);
  // Overlay settings — kept for the whole page, so turning the overlay off and on again restores them.
  const [opacity, setOpacity] = useState(0.5);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<PresenterOverlaySettings["position"]>("center");
  const [span, setSpan] = useState(false);
  const [normalizeSize, setNormalizeSize] = useState(true);
  // Host hand gestures (default off) and what's recognized right now — for the host's own indicator, never drawn into the stream.
  const [gestures, setGestures] = useState(false);
  const [gestureLabel, setGestureLabel] = useState<
    "pointing" | "zooming" | "reset" | "drawing" | "shape" | "erasing" | "spotlight" | "voice" | "thumbsup" | "thumbsdown" | "wave" | "unavailable" | null
  >(null);
  const [spotlightOn, setSpotlightOn] = useState(false);
  const [penColor, setPenColor] = useState<PresenterOverlaySettings["penColor"]>("red");
  const [arrowMode, setArrowMode] = useState(false);
  const [voicePin, setVoicePin] = useState(false);
  const [voicePinSupported, setVoicePinSupported] = useState(false);
  /** Boxes and ellipses pinned to the share, and the one just drawn that is waiting for its optional label. */
  const [shapes, setShapes] = useState<PinnedShape[]>([]);
  const [pendingShapeId, setPendingShapeId] = useState<number | null>(null);
  // Owned here, not by the settings panel, so closing or reopening that panel never loses a half-typed label.
  const shapePrompt = useShapePrompt(
    pendingShapeId,
    (id, text) => overlayRef.current?.compositor.setShapeText(id, text),
    () => setPendingShapeId(null),
  );
  const [shapeKind, setShapeKind] = useState<PresenterOverlaySettings["shapeKind"]>("box");
  // The stamp tool: what a thumb-to-middle-finger pinch drops (point aims it), and the text it currently carries.
  // Retyping the text doesn't touch stamps already dropped — only the next one uses it.
  const [stampShapeKind, setStampShapeKind] = useState<PresenterOverlaySettings["stampShapeKind"]>("box");
  const [stampText, setStampText] = useState("");
  const [background, setBackground] = useState<PresenterOverlaySettings["background"]>("remove");
  const [panelShape, setPanelShape] = useState<PanelShape>("rounded");
  const [softEdge, setSoftEdge] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [caption, setCaption] = useState("");
  // Follow-the-speaker (default on) and an optional pinned person, who overrides it. Kept for the whole page like the other settings.
  const [followSpeaker, setFollowSpeaker] = useState(true);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [shownId, setShownId] = useState<string>(LOCAL_ID);
  // Guests who can be added to the overlay (everyone else in the meeting), and who is on it / has asked. The roster is the truth; the version counter re-renders when it changes.
  const [guests, setGuests] = useState<Person[]>([]);
  const [policy, setPolicy] = useState<JoinPolicy>("ask");
  const [rosterVersion, setRosterVersion] = useState(0);
  // "Guests can point" (default off): the board says who may, and the version counter re-renders the host's list when that changes.
  const [pointerPolicy, setPointerPolicy] = useState<PointerPolicy>("off");
  const [pointerVersion, setPointerVersion] = useState(0);
  const [pointingIds, setPointingIds] = useState<string[]>([]);
  // "Guests can draw" (default off): its own policy, approvals and revokes, but the same colour per guest as their pointer.
  const [drawPolicy, setDrawPolicy] = useState<PointerPolicy>("off");
  const [drawingIds, setDrawingIds] = useState<string[]>([]);
  const guestColorsRef = useRef(new Map<string, string>());
  const pointerBoardRef = useRef(new GuestPointerBoard(guestColorsRef.current));
  const drawBoardRef = useRef(new GuestPointerBoard(guestColorsRef.current));
  /** Guests whose ghost is on the share right now, and the pointer / draw status each was last told. */
  const shownIdsRef = useRef<string[]>([]);
  const pointerSentRef = useRef(new Map<string, PointerStatus>());
  const drawSentRef = useRef(new Map<string, PointerStatus>());
  const announcedRef = useRef(false);
  const overlayIdsRef = useRef<string[]>([]);
  const rosterRef = useRef(new CoGhostRoster());
  const hadGuestsRef = useRef(false);
  const followBeforeGuestsRef = useRef(true);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageCorner, setImageCorner] = useState<OverlayCorner>("top-right");
  const imageRef = useRef<ImageBitmap | null>(null);
  const followRef = useRef({ follow: true, pinned: null as string | null });
  // Mirrors `span` into the 100 ms tick, which reads refs rather than state to avoid stale closures.
  const spanRef = useRef(span);
  useEffect(() => {
    spanRef.current = span;
  }, [span]);
  const shareRef = useRef<Share | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Pop-out preview (Document PiP): the window, its own <video>/file input, and whether its settings panel is showing.
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipPanelOpen, setPipPanelOpen] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipFileInputRef = useRef<HTMLInputElement | null>(null);
  // Listeners/cleanups registered on earlier renders read the room through a ref so it's never stale.
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    setSupported(isPresenterOverlaySupported());
    setVoicePinSupported(isVoicePinSupported());
  }, []);

  // Where the panel was left last time. Storage can be missing or blocked; the panel works without it.
  useEffect(() => {
    try {
      const stored = parseStoredPanel(window.localStorage.getItem(PANEL_STORAGE_KEY));
      setPanelPos(stored.position);
      setPanelCollapsed(stored.collapsed);
    } catch {
      // no storage: defaults
    }
  }, []);

  function savePanel(position: PanelPosition | null, collapsed: boolean) {
    try {
      window.localStorage.setItem(PANEL_STORAGE_KEY, serializePanel({ position, collapsed }));
    } catch {
      // no storage: it just won't be remembered
    }
  }

  /** The panel's current size, for keeping it reachable; a nominal size before it has been drawn. */
  function panelSize() {
    const rect = panelRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 288, height: rect?.height ?? 40 };
  }

  // A window that shrinks must not strand the panel out of reach.
  useEffect(() => {
    if (!panelPos) return;
    const onResize = () =>
      setPanelPos((position) => (position ? clampPanelPosition(position, panelSize(), { width: window.innerWidth, height: window.innerHeight }) : position));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelPos !== null]);

  function currentSettings(): PresenterOverlaySettings {
    return { opacity, scale, position, span, gestures, penColor, arrowMode, voicePin, shapeKind, stampShapeKind, stampText, normalizeSize, background, panelShape, softEdge, mirror, caption, autoCaption: true, image: imageRef.current, imageCorner };
  }

  function updateSettings(patch: Partial<PresenterOverlaySettings>) {
    const overlay = overlayRef.current;
    if (overlay) Object.assign(overlay.compositor.settings, patch);
  }

  /** Stops everything the overlay owns and restores the camera tile. Doesn't touch the published track — callers swap/unpublish it first. */
  async function disposeOverlay() {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlayRef.current = null;
    setOverlayStatus("off");
    clearInterval(overlay.tick);
    setGestureLabel(null);
    setSpotlightOn(false);
    setShapes([]);
    setPendingShapeId(null);
    setPeople([]);
    setGuests([]);
    // Everyone who was on the overlay, or waiting to be, is told it's gone.
    for (const id of rosterRef.current.clear()) sendToGuest(id, { t: "overlay-state", state: "off" });
    rosterChanged();
    // No ghosts, no pointers: every guest is told theirs is off, and any dots go.
    pointerBoardRef.current.clearLive();
    drawBoardRef.current.clearLive();
    shownIdsRef.current = [];
    const stillHere = new Set<string>();
    roomRef.current?.remoteParticipants.forEach((participant) => stillHere.add(participant.identity));
    pushGuestStatuses(stillHere);
    setPointingIds([]);
    setDrawingIds([]);
    overlay.compositor.stop();
    overlay.screenClone.stop();
    overlay.cameraTrack.stop();
    const room = roomRef.current;
    if (room && overlay.cameraWasEnabled) {
      await room.localParticipant.setCameraEnabled(true).catch(() => {});
    }
  }

  async function addOverlay() {
    const share = shareRef.current;
    if (!room || !share || overlayStatus !== "off") return;
    setOverlayStatus("starting");
    let screenClone: MediaStreamTrack | null = null;
    let cameraTrack: MediaStreamTrack | null = null;
    let compositor: PresenterOverlayCompositor | null = null;
    try {
      screenClone = share.rawScreen.clone();

      // Our own capture of the same camera the room is using — independent
      // of the published camera track, so turning that one off below
      // doesn't cut this feed. Asks for 720p (the compositor downscales to
      // its segmentation size) because some webcams, laptop ones
      // especially, serve low-res modes by cropping the sensor, which
      // narrows the view and clips an arm reached out toward the slide.
      const deviceId = room.getActiveDevice("videoinput");
      const camera = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 20 },
        },
        audio: false,
      });
      cameraTrack = camera.getVideoTracks()[0];

      compositor = await startPresenterOverlayCompositor({
        screenTrack: screenClone,
        cameraTrack,
        cameraLabel: room.localParticipant.name || "",
        onGesture: setGestureLabel,
        onShapeFinished: setPendingShapeId,
        onShapes: (list) => {
          setShapes(list);
          setPendingShapeId((pending) => (pending !== null && list.some((shape) => shape.id === pending) ? pending : null));
        },
        onError: (error) => {
          console.error("[presenter-overlay] compositor failed", error);
          onError("The camera overlay stopped unexpectedly.");
          removeOverlay();
        },
      });
      Object.assign(compositor.settings, currentSettings());
      // Favor sharpness over smoothness — slide text matters more than motion.
      compositor.track.contentHint = "detail";

      // The share may have ended while the camera/model were loading.
      if (shareRef.current !== share) throw new Error("Screen share ended while starting the overlay.");

      // Hide the regular camera tile so the presenter doesn't appear twice.
      const cameraWasEnabled = room.localParticipant.isCameraEnabled;
      if (cameraWasEnabled) await room.localParticipant.setCameraEnabled(false);

      const follower = new SpeakerFollower(LOCAL_ID);
      follower.setFollow(followRef.current.follow);
      follower.setPinned(followRef.current.pinned);
      const attached = new Map<string, MediaStreamTrack>();
      const started = compositor;
      const tick = setInterval(() => syncFollow(started, follower, attached), FOLLOW_TICK_MS);
      overlayRef.current = { compositor, screenClone, cameraTrack, cameraWasEnabled, follower, tick, attached };
      // userProvidedTrack: true — otherwise LiveKit stops the track it's
      // replacing, and we need the raw capture to swap back to later.
      await share.track.replaceTrack(compositor.track, { userProvidedTrack: true });
      reattachLocalTiles(share.track);
      setOverlayStatus("on");
    } catch (error) {
      console.error("[presenter-overlay] failed to start", error);
      if (overlayRef.current) {
        await removeOverlay();
      } else {
        compositor?.stop();
        screenClone?.stop();
        cameraTrack?.stop();
        setOverlayStatus("off");
      }
      onError("Couldn't add your camera to the share.");
    }
  }

  /**
   * One sample of the room: keeps the compositor's camera sources in step
   * with who has a camera on (guests joining, leaving, muting), then asks the
   * follower whose cut-out to show. Runs every FOLLOW_TICK_MS while the
   * overlay is on; polled rather than event-driven so a missed event can't
   * leave a stale source behind.
   */
  function syncFollow(compositor: PresenterOverlayCompositor, follower: SpeakerFollower, attached: Map<string, MediaStreamTrack>) {
    const room = roomRef.current;
    if (!room) return;
    const eligible = new Set<string>([LOCAL_ID]);
    const nextPeople: Person[] = [{ id: LOCAL_ID, label: "You" }];
    const live = new Set<string>();
    const present = new Set<string>();
    const nextGuests: Person[] = [];
    room.remoteParticipants.forEach((participant) => {
      present.add(participant.identity);
      nextGuests.push({ id: participant.identity, label: participant.name || "Guest" });
      const publication = participant.getTrackPublication(Track.Source.Camera);
      const mediaTrack = publication?.track?.mediaStreamTrack;
      if (!publication || !mediaTrack || publication.isMuted) return;
      live.add(participant.identity);
      eligible.add(participant.identity);
      nextPeople.push({ id: participant.identity, label: participant.name || "Guest" });
      if (attached.get(participant.identity) !== mediaTrack) {
        // New guest camera, or the guest switched cameras: (re)build their source.
        compositor.removeSource(participant.identity);
        compositor.addSource({ id: participant.identity, label: participant.name || "Guest", track: mediaTrack, isLocal: false });
        attached.set(participant.identity, mediaTrack);
      }
    });
    attached.forEach((_track, id) => {
      if (live.has(id)) return;
      compositor.removeSource(id);
      attached.delete(id);
    });

    // Co-ghosts who left or turned their camera off drop out; unanswered invites/requests lapse.
    const roster = rosterRef.current;
    const now = performance.now();
    let rosterDirty = false;
    for (const id of roster.prune(now, eligible, present)) {
      sendToGuest(id, { t: "overlay-state", state: "off" });
      rosterDirty = true;
    }
    const lapsed = roster.expire(now);
    for (const id of lapsed.invites) sendToGuest(id, { t: "overlay-state", state: "off" });
    for (const id of lapsed.requests) sendToGuest(id, { t: "overlay-state", state: "timeout" });
    if (rosterDirty || lapsed.invites.length > 0 || lapsed.requests.length > 0) rosterChanged();

    const speakers = new Map<string, number>();
    room.activeSpeakers.forEach((participant) => {
      if (participant.isSpeaking) speakers.set(participant.isLocal ? LOCAL_ID : participant.identity, participant.audioLevel);
    });
    const coGhosts = roster.pinned;
    if (coGhosts.length > 0) {
      // Guests the presenter added stay up with them, in the order added; who's speaking no longer picks who is shown.
      compositor.setVisible([LOCAL_ID, ...coGhosts]);
      shownIdsRef.current = coGhosts;
      setShownId(LOCAL_ID);
      if (spanRef.current) {
        // Full-screen Reach with co-ghosts: one of the ghosts still covers the whole frame, picked by the
        // same sustained-speech rules as normal follow-the-speaker, restricted to who is actually on the share.
        const featuredEligible = new Set<string>([LOCAL_ID, ...coGhosts]);
        compositor.setFeatured(follower.update(now, speakers, featuredEligible, LOCAL_ID));
      } else {
        compositor.setFeatured(null);
      }
    } else {
      const shown = follower.update(now, speakers, eligible, LOCAL_ID);
      compositor.setVisible([shown]);
      shownIdsRef.current = shown === LOCAL_ID ? [] : [shown];
      setShownId(shown);
      compositor.setFeatured(null);
    }
    syncGuestPointers(compositor, present, now);
    setGuests((previous) =>
      previous.length === nextGuests.length && previous.every((guest, i) => guest.id === nextGuests[i].id && guest.label === nextGuests[i].label)
        ? previous
        : nextGuests,
    );

    setPeople((previous) =>
      previous.length === nextPeople.length && previous.every((person, i) => person.id === nextPeople[i].id && person.label === nextPeople[i].label)
        ? previous
        : nextPeople,
    );
  }

  const boardOf = (ability: GuestAbility) => (ability === "pointer" ? pointerBoardRef.current : drawBoardRef.current);
  const sentOf = (ability: GuestAbility) => (ability === "pointer" ? pointerSentRef.current : drawSentRef.current);

  /**
   * Each tick: who is on the share decides who may point or draw. Tells any guest whose status changed, feeds the
   * compositor the dots and pen tips, and updates the host's "pointing" / "drawing" markers.
   */
  function syncGuestPointers(compositor: PresenterOverlayCompositor, present: Set<string>, now: number) {
    const shown = shownIdsRef.current;
    for (const ability of ["pointer", "draw"] as const) {
      const board = boardOf(ability);
      board.prune(present);
      for (const id of board.expire(now)) sendGuestStatus(ability, id, board.status(id, false));
    }
    pushGuestStatuses(present);
    compositor.setGuestPointers(pointerBoardRef.current.dots(now, shown));
    compositor.setGuestPens(drawBoardRef.current.dots(now, shown));
    const marker = (ability: GuestAbility) => Array.from(present).filter((id) => boardOf(ability).isPointing(id, now) && shown.includes(id));
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
    const pointing = marker("pointer");
    const drawing = marker("draw");
    setPointingIds((previous) => (same(previous, pointing) ? previous : pointing));
    setDrawingIds((previous) => (same(previous, drawing) ? previous : drawing));
  }

  /** Sends each present guest their pointer and draw status if it differs from what they were last told. */
  function pushGuestStatuses(present: Set<string>) {
    const overlayOn = !!overlayRef.current;
    let changed = false;
    for (const ability of ["pointer", "draw"] as const) {
      const board = boardOf(ability);
      const sent = sentOf(ability);
      sent.forEach((_status, id) => {
        if (!present.has(id)) sent.delete(id);
      });
      present.forEach((id) => {
        const status = overlayOn ? board.status(id, shownIdsRef.current.includes(id)) : "off";
        if (sent.get(id) === status) return;
        sent.set(id, status);
        sendGuestStatus(ability, id, status);
        changed = true;
      });
    }
    if (changed) setPointerVersion((version) => version + 1);
  }

  /** Re-pushes to everyone already told something (after a host decision). */
  function repushGuestStatuses(extra?: string) {
    const present = new Set<string>(Array.from(pointerSentRef.current.keys()).concat(Array.from(drawSentRef.current.keys())));
    if (extra) present.add(extra);
    pushGuestStatuses(present);
    setPointerVersion((version) => version + 1);
  }

  function sendGuestStatus(ability: GuestAbility, id: string, status: PointerStatus) {
    const message: PointerToGuest | DrawToGuest = ability === "pointer" ? { t: "pointer-status", status } : { t: "draw-status", status };
    roomRef.current?.localParticipant
      .publishData(encodePointerMessage(message), { reliable: true, topic: ability === "pointer" ? POINTER_TOPIC : DRAW_TOPIC, destinationIdentities: [id] })
      .catch(() => {});
  }

  /** A pointer or draw message from a guest. The board decides; anything from a guest who isn't shown and permitted is ignored. */
  function handleGuestAbilityMessage(ability: GuestAbility, id: string, payload: Uint8Array) {
    const message = ability === "pointer" ? parsePointerToHost(payload) : parseDrawToHost(payload);
    if (!message || !overlayRef.current) return;
    const board = boardOf(ability);
    const visible = shownIdsRef.current.includes(id);
    if (message.t === "pointer-request" || message.t === "draw-request") {
      const status = board.request(id, visible, performance.now());
      if (status === "pending") setPanelOpen(true);
      repushGuestStatuses(id);
      return;
    }
    board.accept(id, message, visible, performance.now());
  }

  function changeGuestPolicy(ability: GuestAbility, next: PointerPolicy) {
    const board = boardOf(ability);
    board.policy = next;
    if (ability === "pointer") setPointerPolicy(next);
    else setDrawPolicy(next);
    // Anyone still waiting is answered by the status change on the next tick.
    if (next !== "ask") for (const id of board.requesting) board.decide(id, false);
    setPointerVersion((version) => version + 1);
  }

  function decideGuestAbility(ability: GuestAbility, id: string, allow: boolean) {
    boardOf(ability).decide(id, allow);
    repushGuestStatuses();
  }

  function revokeGuestAbility(ability: GuestAbility, id: string) {
    boardOf(ability).revoke(id);
    repushGuestStatuses();
  }

  function allowGuestAbility(ability: GuestAbility, id: string) {
    boardOf(ability).allow(id);
    repushGuestStatuses();
  }

  /** Sends one overlay message to one guest. Best effort: a guest who has just left simply doesn't get it. */
  function sendToGuest(id: string, message: ToGuest) {
    roomRef.current?.localParticipant
      .publishData(encodeMessage(message), { reliable: true, topic: OVERLAY_TOPIC, destinationIdentities: [id] })
      .catch(() => {});
  }

  /**
   * Call after any roster change. Follow-the-speaker is switched off while
   * a guest is on the overlay (the presenter can switch it back on), and
   * goes back to what it was once the last guest is gone.
   */
  function rosterChanged() {
    const hasGuests = rosterRef.current.pinned.length > 0;
    if (hasGuests && !hadGuestsRef.current) {
      followBeforeGuestsRef.current = followRef.current.follow;
      changeFollow(false);
    } else if (!hasGuests && hadGuestsRef.current && !followRef.current.follow) {
      changeFollow(followBeforeGuestsRef.current);
    }
    hadGuestsRef.current = hasGuests;
    setRosterVersion((version) => version + 1);
  }

  function tellGuest(id: string, state: GuestOverlayState) {
    sendToGuest(id, { t: "overlay-state", state });
  }

  /** A message from a guest. The roster decides; this only turns its answer into what the guest is told. */
  function handleGuestMessage(id: string, message: ToPresenter) {
    const roster = rosterRef.current;
    const now = performance.now();
    if (message.t === "overlay-leave") {
      if (roster.remove(id)) rosterChanged();
      tellGuest(id, "off");
      return;
    }
    if (message.t === "overlay-response") {
      if (!roster.invited.includes(id)) return;
      const result = roster.respond(id, message.accept);
      if (message.accept) tellGuest(id, result.ok ? "on" : "full");
      rosterChanged();
      return;
    }
    // overlay-join-request
    if (!overlayRef.current) {
      tellGuest(id, "unavailable");
      return;
    }
    const result = roster.guestRequest(id, now);
    if (result.ok) {
      tellGuest(id, result.status === "added" ? "on" : "pending");
      if (result.status === "pending") setPanelOpen(true);
    } else if (result.reason === "full") {
      tellGuest(id, "full");
    } else if (result.reason === "closed") {
      tellGuest(id, "closed");
    } else if (roster.has(id)) {
      tellGuest(id, "on");
    }
    rosterChanged();
  }

  /** "Add to overlay": the guest must Allow before anything is shown. */
  function inviteGuest(id: string) {
    const result = rosterRef.current.invite(id, performance.now());
    if (!result.ok) {
      if (result.reason === "full") onError("Overlay is full. Remove someone first.");
      return;
    }
    sendToGuest(id, { t: "overlay-request" });
    rosterChanged();
  }

  function removeGuest(id: string) {
    rosterRef.current.remove(id);
    tellGuest(id, "off");
    rosterChanged();
  }

  /** The presenter's answer to a guest's request (policy "Ask me"). */
  function decideRequest(id: string, allow: boolean) {
    const result = rosterRef.current.decide(id, allow);
    if (!allow) tellGuest(id, "declined");
    else tellGuest(id, result.ok ? "on" : "full");
    rosterChanged();
  }

  function changePolicy(next: JoinPolicy) {
    const roster = rosterRef.current;
    roster.policy = next;
    setPolicy(next);
    if (next === "off") {
      // Anyone still waiting is told the door is closed.
      for (const id of roster.requesting) {
        roster.decide(id, false);
        tellGuest(id, "closed");
      }
      rosterChanged();
    }
  }

  /** Swaps the untouched capture back in (full resolution, LiveKit-owned again), then disposes the overlay. */
  async function removeOverlay() {
    const share = shareRef.current;
    if (!overlayRef.current) return;
    if (share && share.track.mediaStreamTrack !== share.rawScreen) {
      await share.track.replaceTrack(share.rawScreen, { userProvidedTrack: false }).catch((error) => {
        console.error("[presenter-overlay] failed to restore the plain screen share", error);
      });
      reattachLocalTiles(share.track);
    }
    await disposeOverlay();
  }

  // Track the presenter's own screen share: appears when they start
  // sharing with LiveKit's button, and on unpublish (however it happened)
  // tears the overlay down and stops the raw capture LiveKit may have
  // lost track of.
  useEffect(() => {
    if (!room) return;
    const { localParticipant } = room;

    function adopt(publication: LocalTrackPublication) {
      const track = publication.videoTrack;
      if (publication.source !== Track.Source.ScreenShare || !track) return;
      const rawScreen = track.mediaStreamTrack;
      const next: Share = { publication, track, rawScreen };
      shareRef.current = next;
      setShare(next);
      // After the overlay swap LiveKit is listening to the combined track, not
      // the capture, so the browser's own "Stop sharing" would go unnoticed.
      rawScreen.addEventListener("ended", () => {
        if (shareRef.current === next && overlayRef.current) {
          roomRef.current?.localParticipant.unpublishTrack(next.track).catch(() => {});
        }
      });
    }

    const onPublished = (publication: LocalTrackPublication) => adopt(publication);
    const onUnpublished = (publication: LocalTrackPublication) => {
      const current = shareRef.current;
      if (!current || publication.trackSid !== current.publication.trackSid) return;
      shareRef.current = null;
      setShare(null);
      disposeOverlay();
      current.rawScreen.stop();
      pipWindowRef.current?.close();
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    };

    const existing = localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (existing) adopt(existing);
    room.on(RoomEvent.LocalTrackPublished, onPublished);
    room.on(RoomEvent.LocalTrackUnpublished, onUnpublished);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, onPublished);
      room.off(RoomEvent.LocalTrackUnpublished, onUnpublished);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Tell everyone (and the meeting view) whose camera is on the overlay, so their camera tiles are hidden. Only while this
  // client is the one sharing; when the share ends, clear it once so a guest's client doesn't wipe the presenter's list.
  useEffect(() => {
    if (!room) return;
    let ids: string[] | null = null;
    if (share) {
      announcedRef.current = true;
      ids = overlayStatus === "on" ? [room.localParticipant.identity, ...rosterRef.current.pinned] : [];
    } else if (announcedRef.current) {
      announcedRef.current = false;
      ids = [];
    }
    if (!ids) return;
    overlayIdsRef.current = ids;
    onOverlayIds(ids);
    room.remoteParticipants.forEach((participant) => sendToGuest(participant.identity, { t: "overlay-roster", ids: ids as string[] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, share, overlayStatus, rosterVersion]);

  // Someone who joins later needs the current list too.
  useEffect(() => {
    if (!room) return;
    const onJoined = (participant: { identity: string }) => {
      if (announcedRef.current) sendToGuest(participant.identity, { t: "overlay-roster", ids: overlayIdsRef.current });
    };
    room.on(RoomEvent.ParticipantConnected, onJoined);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Requests and answers from guests. Addressed to this participant only, and ignored unless they parse exactly.
  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) => {
      if (topic !== OVERLAY_TOPIC || !participant) return;
      const message = parseToPresenter(payload);
      if (message) handleGuestMessage(participant.identity, message);
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Pointer and draw requests and positions from guests. Addressed to this participant only; the board ignores anything from a guest who isn't shown and permitted.
  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array, participant?: { identity: string }, _kind?: unknown, topic?: string) => {
      if (!participant || (topic !== POINTER_TOPIC && topic !== DRAW_TOPIC)) return;
      handleGuestAbilityMessage(topic === POINTER_TOPIC ? "pointer" : "draw", participant.identity, payload);
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Leaving the meeting: release the camera/model feed and any pop-out.
  useEffect(() => {
    return () => {
      disposeOverlay();
      pipWindowRef.current?.close();
      imageRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Opens the pop-out preview. Prefers Document Picture-in-Picture (Chrome
   * 116+), a floating always-on-top window that holds real page content:
   * the preview video, which toggles the settings panel when clicked, so
   * the presenter can adjust things — including turning the overlay off
   * and on — without leaving their slides app. Falls back to plain video
   * picture-in-picture (preview only) where it's unavailable. Either
   * window can be moved and resized.
   */
  async function openPreview() {
    if (pipWindowRef.current) {
      pipWindowRef.current.focus();
      return;
    }
    const documentPip = documentPictureInPicture();
    if (documentPip) {
      try {
        const pip = await documentPip.requestWindow({ width: PIP_WIDTH, height: PIP_HEIGHT });
        copyStyleSheets(pip);
        pip.document.title = "Presenter preview";
        pip.document.body.style.margin = "0";
        pip.document.body.style.background = "#000";
        pip.addEventListener("pagehide", () => {
          pipWindowRef.current = null;
          setPipWindow(null);
          setPipPanelOpen(false);
        });
        pipWindowRef.current = pip;
        setPipWindow(pip);
        return;
      } catch (error) {
        console.warn("[presenter-overlay] document picture-in-picture failed, using video picture-in-picture", error);
      }
    }
    try {
      await previewRef.current?.requestPictureInPicture();
    } catch {
      onError("Couldn't open the pop-out preview.");
    }
  }

  // Clicking the pop-out's preview shows/hides its settings panel, growing
  // the window to fit it (and shrinking it back). The click is the user
  // activation Document PiP requires for resizing; if the resize is
  // refused anyway, the panel just scrolls within the current size.
  function togglePipPanel() {
    const next = !pipPanelOpen;
    setPipPanelOpen(next);
    try {
      pipWindowRef.current?.resizeBy(0, next ? PIP_PANEL_HEIGHT : -PIP_PANEL_HEIGHT);
    } catch {
      // see above
    }
  }

  // Both previews show exactly what viewers see: the combined track while
  // the overlay is on, the plain capture while it's off. Not CSS-mirrored —
  // any mirroring is baked in by the compositor.
  const previewTrack = overlayStatus === "on" ? (overlayRef.current?.compositor.track ?? null) : (share?.rawScreen ?? null);
  useEffect(() => {
    for (const video of [previewRef.current, pipVideoRef.current]) {
      if (!video) continue;
      video.srcObject = previewTrack ? new MediaStream([previewTrack]) : null;
      if (previewTrack) video.play().catch(() => {});
    }
  }, [previewTrack, pipWindow]);

  // Chrome auto-opens the pop-out when the presenter switches away from the
  // tab (camera-using sites only), so the preview follows them into their
  // slides app without a click.
  useEffect(() => {
    if (overlayStatus !== "on") return;
    const mediaSession = navigator.mediaSession as MediaSession & {
      setActionHandler(action: string, handler: (() => void) | null): void;
    };
    try {
      mediaSession.setActionHandler("enterpictureinpicture", () => {
        openPreview();
      });
    } catch {
      // Action not supported in this browser version — manual Pop out still works.
    }
    return () => {
      try {
        mediaSession.setActionHandler("enterpictureinpicture", null);
      } catch {
        // see above
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayStatus]);

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      // Decoded locally — the file itself is never uploaded anywhere.
      const bitmap = await createImageBitmap(file);
      imageRef.current?.close();
      imageRef.current = bitmap;
      updateSettings({ image: bitmap });
      setImageName(file.name);
    } catch {
      onError("Couldn't read that image.");
    }
  }

  function clearImage() {
    updateSettings({ image: null });
    imageRef.current?.close();
    imageRef.current = null;
    setImageName(null);
  }

  function changeFollow(follow: boolean) {
    setFollowSpeaker(follow);
    followRef.current.follow = follow;
    overlayRef.current?.follower.setFollow(follow);
  }

  function changePinned(id: string | null) {
    setPinnedId(id);
    followRef.current.pinned = id;
    overlayRef.current?.follower.setPinned(id);
  }

  function toggleOverlay() {
    if (overlayStatus === "on") removeOverlay();
    else if (overlayStatus === "off") addOverlay();
  }

  if (!supported || !share) return null;

  const overlayOn = overlayStatus === "on";
  const roster = rosterRef.current;
  const coGhosts = roster.pinned;
  const labelOf = (id: string) => guests.find((guest) => guest.id === id)?.label ?? "Guest";
  const labelClass = "flex flex-col gap-1 text-xs text-white/70";
  const segmentClass = (selected: boolean) =>
    `flex-1 rounded-md px-2 py-1 text-xs ${selected ? "bg-white/20 text-white" : "bg-white/5 text-white/70 hover:bg-white/10"}`;

  // Live values for the fields each preset category cares about, recomputed every render — a preset's
  // highlighted state is never cached, so it can never go stale (see PresetRow / presetMatches).
  const currentLookValues: LookPresetFields = { scale, background, panelShape, opacity, position, span };
  const currentTrustValues: TrustPresetFields = {
    policy,
    pointerPolicy,
    drawPolicy,
    followSpeaker,
    pinnedId: pinnedId === LOCAL_ID ? "self" : pinnedId === null ? null : undefined,
  };
  const currentAnnotationValues: AnnotationPresetFields = { gestures, arrowMode, penColor, voicePin };

  function applyLookPreset(fields: LookPresetFields) {
    if (fields.scale !== undefined) {
      setScale(fields.scale);
      updateSettings({ scale: fields.scale });
    }
    if (fields.background !== undefined) {
      setBackground(fields.background);
      updateSettings({ background: fields.background });
    }
    if (fields.panelShape !== undefined) {
      setPanelShape(fields.panelShape);
      updateSettings({ panelShape: fields.panelShape });
    }
    if (fields.opacity !== undefined) {
      setOpacity(fields.opacity);
      updateSettings({ opacity: fields.opacity });
    }
    if (fields.position !== undefined) {
      setPosition(fields.position);
      updateSettings({ position: fields.position });
    }
    if (fields.span !== undefined) {
      setSpan(fields.span);
      updateSettings({ span: fields.span });
    }
  }

  // Each field here reuses the same handler its Fine-tune control calls, not a raw setState — those
  // handlers carry side effects (declining pending requests, poking the live follower) a preset must not skip.
  function applyTrustPreset(fields: TrustPresetFields) {
    if (fields.policy !== undefined) changePolicy(fields.policy);
    if (fields.pointerPolicy !== undefined) changeGuestPolicy("pointer", fields.pointerPolicy);
    if (fields.drawPolicy !== undefined) changeGuestPolicy("draw", fields.drawPolicy);
    if (fields.followSpeaker !== undefined) changeFollow(fields.followSpeaker);
    if (fields.pinnedId !== undefined) changePinned(fields.pinnedId === "self" ? LOCAL_ID : fields.pinnedId);
  }

  function applyAnnotationPreset(fields: AnnotationPresetFields) {
    if (fields.gestures !== undefined) {
      setGestures(fields.gestures);
      updateSettings({ gestures: fields.gestures });
    }
    if (fields.arrowMode !== undefined) {
      setArrowMode(fields.arrowMode);
      updateSettings({ arrowMode: fields.arrowMode });
    }
    if (fields.penColor !== undefined) {
      setPenColor(fields.penColor);
      updateSettings({ penColor: fields.penColor });
    }
    if (fields.voicePin !== undefined) {
      changeVoicePin(fields.voicePin);
    }
  }

  /** Reused by the Fine-tune checkbox and the Whiteboard preset alike, so both go through one place. */
  function changeVoicePin(next: boolean) {
    setVoicePin(next);
    updateSettings({ voicePin: next });
  }

  function presetsTabBody() {
    // Whether Whiteboard Mode is "the" active look right now, judged only by the fields it shares with the old
    // Pointer Only (gestures/arrowMode/penColor) — not by voicePin, which is exactly the field this checkbox
    // itself controls. Gating the checkbox's own visibility on the field it sets would hide it the instant it's
    // unticked, with no way back short of re-clicking Whiteboard Mode (which would also reset pen/arrow).
    const whiteboardLook = ANNOTATION_PRESETS.find((preset) => preset.id === "whiteboard")!.fields;
    const whiteboardLookActive = gestures === whiteboardLook.gestures && arrowMode === whiteboardLook.arrowMode && penColor === whiteboardLook.penColor;
    return (
      <>
        <PresetRow title="Look" presets={LOOK_PRESETS} current={currentLookValues} onApply={applyLookPreset} segmentClass={segmentClass} />
        {overlayOn && (
          <PresetRow title="Collaboration" presets={TRUST_PRESETS} current={currentTrustValues} onApply={applyTrustPreset} segmentClass={segmentClass} />
        )}
        <div className="flex flex-col gap-1 text-xs text-white/70">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Annotation</span>
          <div className="flex flex-wrap items-center gap-1">
            {ANNOTATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyAnnotationPreset(preset.fields)}
                aria-pressed={presetMatches(preset.fields, currentAnnotationValues)}
                className={`${segmentClass(presetMatches(preset.fields, currentAnnotationValues))} flex-none`}
              >
                {preset.label}
              </button>
            ))}
            {whiteboardLookActive && voicePinSupported && (
              <label className="ml-1 flex flex-none items-center gap-1 text-xs text-white/70">
                <input type="checkbox" data-testid="overlay-voice-pin-preset" checked={voicePin} onChange={(e) => changeVoicePin(e.target.checked)} />
                Voice Pin
              </label>
            )}
          </div>
        </div>
      </>
    );
  }

  // Rendered twice when the pop-out is open (page panel + pop-out panel), each with its own file input.
  const settingsFields = (fileInput: RefObject<HTMLInputElement>) => (
    <>
      <label className="flex items-center justify-between gap-2 border-b border-white/10 pb-3 text-sm font-medium text-white">
        {overlayStatus === "starting" ? "Adding you…" : `Overlay ${overlayOn ? "on" : "off"}`}
        <button
          type="button"
          role="switch"
          aria-checked={overlayOn}
          aria-label="Show me on the share"
          disabled={overlayStatus === "starting"}
          onClick={toggleOverlay}
          className={`relative h-5 w-9 flex-none rounded-full transition-colors disabled:opacity-50 ${overlayOn ? "bg-red-500" : "bg-white/20"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${overlayOn ? "translate-x-4" : "translate-x-0"}`}
          />
        </button>
      </label>
      {overlayStatus === "off" && (
        <p className="text-[11px] text-white/50">Viewers see your plain screen share. Settings below apply when you turn it on.</p>
      )}

      <div className="flex gap-1 border-b border-white/10 pb-3" role="tablist" aria-label="Overlay settings tabs">
        <button
          type="button"
          role="tab"
          aria-selected={settingsTab === "presets"}
          onClick={() => setSettingsTab("presets")}
          className={segmentClass(settingsTab === "presets")}
        >
          Presets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={settingsTab === "finetune"}
          onClick={() => setSettingsTab("finetune")}
          className={segmentClass(settingsTab === "finetune")}
        >
          Fine-tune
        </button>
      </div>
      {settingsTab === "presets" ? presetsTabBody() : fineTuneTabBody(fileInput)}
    </>
  );

  function fineTuneTabBody(fileInput: RefObject<HTMLInputElement>) {
    return (
      <>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Guest permissions</span>
      <label className="flex items-center justify-between gap-2 text-xs text-white/70">
        Follow the speaker
        <input type="checkbox" checked={followSpeaker} onChange={(e) => changeFollow(e.target.checked)} />
      </label>
      {coGhosts.length > 0 && (
        <p className="text-[11px] text-white/50">
          Guests you add stay on the share with you, so who is speaking doesn&apos;t change the ghost. Follow the speaker applies again
          once they&apos;re removed.
        </p>
      )}
      {people.length > 1 && coGhosts.length === 0 && (
        <div className={labelClass}>
          <span data-testid="overlay-showing">
            Showing: {people.find((person) => person.id === shownId)?.label ?? "You"}{" "}
            {pinnedId ? "(pinned)" : followSpeaker ? "(follows speech)" : "(stays put)"}
          </span>
          <div className="flex flex-wrap gap-1">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => changePinned(pinnedId === person.id ? null : person.id)}
                aria-pressed={pinnedId === person.id}
                title={pinnedId === person.id ? "Unpin" : "Pin this person"}
                className={`${segmentClass(pinnedId === person.id)} flex-none`}
              >
                {person.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {overlayOn && (
        <div className={labelClass} data-testid="overlay-guests">
          <span className="text-white">
            Guests on the overlay ({coGhosts.length}/{MAX_GUEST_GHOSTS})
            {coGhosts.length > 0 && <span className="text-white/60">: {coGhosts.map(labelOf).join(", ")}</span>}
          </span>
          <label className="flex items-center justify-between gap-2">
            When a guest asks to appear
            <select
              value={policy}
              onChange={(e) => changePolicy(e.target.value as JoinPolicy)}
              aria-label="When a guest asks to appear"
              className="rounded-md border border-white/10 bg-white/10 px-1.5 py-1 text-xs text-white"
            >
              <option value="ask">Ask me</option>
              <option value="anyone">Let anyone join</option>
              <option value="off">Off</option>
            </select>
          </label>
          {guests.length === 0 ? (
            <span className="text-white/50">Nobody else is in the showup session yet.</span>
          ) : (
            <ul className="space-y-1">
              {guests.map((guest) => {
                const on = roster.has(guest.id);
                const waiting = roster.invited.includes(guest.id);
                const asking = roster.requesting.includes(guest.id);
                const full = !on && roster.isFull;
                return (
                  <li key={guest.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-white">{guest.label}</span>
                    {on ? (
                      <button type="button" onClick={() => removeGuest(guest.id)} className={`${segmentClass(false)} flex-none`}>
                        Remove
                      </button>
                    ) : waiting ? (
                      <span className="flex-none text-white/60">Waiting for response</span>
                    ) : asking ? (
                      <span className="flex flex-none gap-1">
                        <button type="button" onClick={() => decideRequest(guest.id, true)} className={segmentClass(true)}>
                          Allow
                        </button>
                        <button type="button" onClick={() => decideRequest(guest.id, false)} className={segmentClass(false)}>
                          Deny
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => inviteGuest(guest.id)}
                        disabled={full}
                        title={full ? "Overlay is full" : "Ask this guest to appear on the share"}
                        className={`${segmentClass(false)} flex-none disabled:opacity-40`}
                      >
                        {full ? "Overlay is full" : "Add to overlay"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {overlayOn && guestAbilityBlock("pointer")}
      {overlayOn && guestAbilityBlock("draw")}

      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Framing &amp; Look</span>
      <label className={labelClass}>
        Visibility ({Math.round(opacity * 100)}%)
        <input
          type="range"
          min={0.15}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => {
            const value = Number(e.target.value);
            setOpacity(value);
            updateSettings({ opacity: value });
          }}
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={span}
          onChange={(e) => {
            setSpan(e.target.checked);
            updateSettings({ span: e.target.checked });
          }}
        />
        Reach the whole screen (fills a wide window)
      </label>

      <label className={`flex items-center gap-2 text-xs text-white/70 ${span ? "opacity-40" : ""}`} title={span ? "Not used while the ghost fills the screen" : undefined}>
        <input
          type="checkbox"
          data-testid="overlay-normalize-size"
          disabled={span}
          checked={normalizeSize}
          onChange={(e) => {
            setNormalizeSize(e.target.checked);
            updateSettings({ normalizeSize: e.target.checked });
          }}
        />
        Match everyone&apos;s size (evens out how close people sit)
      </label>

      <label className={`${labelClass} ${span ? "opacity-40" : ""}`}>
        Size ({Math.round(scale * 100)}%)
        <input
          disabled={span}
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={scale}
          onChange={(e) => {
            const value = Number(e.target.value);
            setScale(value);
            updateSettings({ scale: value });
          }}
        />
      </label>

      <div className={labelClass}>
        My background
        <div className="flex gap-1">
          {(["remove", "keep"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`overlay-background-${value}`}
              onClick={() => {
                setBackground(value);
                updateSettings({ background: value });
              }}
              className={segmentClass(background === value)}
            >
              {value === "remove" ? "Remove" : "Keep"}
            </button>
          ))}
        </div>
      </div>

      {background === "keep" && (
        <>
          <div className={labelClass}>
            Panel shape
            <div className="flex gap-1">
              {(["rounded", "circle", "arch"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`overlay-shape-${value}`}
                  onClick={() => {
                    setPanelShape(value);
                    updateSettings({ panelShape: value });
                  }}
                  className={segmentClass(panelShape === value)}
                >
                  {value === "rounded" ? "Rounded" : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={softEdge}
              onChange={(e) => {
                setSoftEdge(e.target.checked);
                updateSettings({ softEdge: e.target.checked });
              }}
            />
            Soft edge
          </label>
        </>
      )}

      <label className="flex items-center gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={mirror}
          onChange={(e) => {
            setMirror(e.target.checked);
            updateSettings({ mirror: e.target.checked });
          }}
        />
        Mirror everyone (point at things naturally)
      </label>

      <div className={`${labelClass} ${span ? "opacity-40" : ""}`}>
        Position
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((value) => (
            <button
              key={value}
              disabled={span}
              type="button"
              onClick={() => {
                setPosition(value);
                updateSettings({ position: value });
              }}
              className={segmentClass(position === value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Annotation &amp; gestures</span>
      <div className={labelClass}>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            data-testid="overlay-gestures"
            checked={gestures}
            onChange={(e) => {
              setGestures(e.target.checked);
              updateSettings({ gestures: e.target.checked });
            }}
          />
          Hand gestures (point, pinch to zoom)
        </label>
        {gestures && gestureLabel && (
          <span data-testid="overlay-gesture-label" className="text-[11px] text-emerald-300">
            {gestureLabel === "pointing"
              ? "Pointing: laser on"
              : gestureLabel === "zooming"
                ? "Pinch: zoomed, move your hand to pan"
                : gestureLabel === "reset"
                  ? "Palm: zoom reset"
                  : gestureLabel === "drawing"
                    ? "Drawing"
                    : gestureLabel === "shape"
                      ? "Drawing a shape"
                      : gestureLabel === "erasing"
                        ? "Erasing"
                    : gestureLabel === "spotlight"
                      ? "Spotlight"
                      : gestureLabel === "thumbsup"
                        ? "Thumbs up 👍"
                        : gestureLabel === "thumbsdown"
                          ? "Thumbs down 👎"
                          : gestureLabel === "wave"
                            ? "Wave 👋"
                            : gestureLabel === "voice"
                              ? "Voice Pin: toggled"
                              : "Couldn't load the hand model — gestures are off"}
          </span>
        )}
        {voicePinSupported ? (
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" data-testid="overlay-voice-pin" checked={voicePin} onChange={(e) => changeVoicePin(e.target.checked)} />
            Voice Pin — hold a V-sign to dictate a label at your pointer
          </label>
        ) : (
          <p className="text-[11px] text-white/50">Voice Pin needs Chrome or Edge.</p>
        )}
        <details className="text-[11px] text-white/60">
          <summary className="cursor-pointer select-none">Which gestures?</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>Point with your index finger, other fingers curled, and hold for a moment: a red laser dot follows your fingertip.</li>
            <li>Pinch thumb and index finger together and hold half a second: the screen zooms 2x toward your pinch. Move your pinched hand to pan.</li>
            <li>Hold an open palm still for half a second: back to the whole screen. A waving palm won&apos;t reset it.</li>
            <li>Raise a fist (hand up in the camera frame) and hold it for a moment: the screen dims except a circle around your hand. Open your hand to bring the light back.</li>
            <li>Thumbs up or thumbs down (other fingers curled), held for a moment, or a wave of an open hand: a 👍, 👎 or 👋 floats up beside you. One reaction every few seconds.</li>
            <li>Hold two fingers together (index and middle, others curled) for a moment to draw in the air; lower them to stop. Freehand drawings fade after a few seconds. Switch on &ldquo;Straight arrow&rdquo; and the same gesture draws a straight arrow from where you start to where you lower your fingers, and it stays until you remove it.</li>
            <li>Hold your thumb and index finger out in an &ldquo;L&rdquo; (other fingers curled) for a moment to draw a box or ellipse: the point where you start is one corner and your fingertip is the opposite corner. Choose Box or Ellipse below; drop the L to finish. Boxes, ellipses and straight arrows stay on the screen until you remove them (Clear drawing, Undo last shape, or the list under Shapes) and can carry a short label. They stay put while you zoom or pan, but do not follow the shared content if it scrolls or changes, so clear them when the content changes.</li>
            <li>Hold three fingers together (index, middle and ring, pinky curled) for a moment to erase: a ring around your middle fingertip wipes any drawing it touches as you move your hand. A box or ellipse is erased only when the ring touches its outline, so you can point inside one safely. Erasing can&apos;t be undone.</li>
            <li>With Voice Pin on: point first so there&apos;s somewhere to anchor it, then hold a &ldquo;V&rdquo; (index and middle apart, other fingers curled — wider than the two-finger pen) for a moment to start dictating; what you say appears where you last pointed. Hold the V again (or lower your hand) to pin it there for good.</li>
            <li>Keep your hand fully in the camera frame. Only the screen zooms, not you.</li>
          </ul>
        </details>
        <div className="flex gap-1">
          <button type="button" data-testid="overlay-zoom-in" onClick={() => overlayRef.current?.compositor.zoomIn()} className={segmentClass(false)}>
            Zoom in
          </button>
          <button type="button" data-testid="overlay-zoom-reset" onClick={() => overlayRef.current?.compositor.resetZoom()} className={segmentClass(false)}>
            Reset zoom
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span>Pen</span>
          {(["red", "yellow", "green"] as const).map((color) => (
            <button
              key={color}
              type="button"
              data-testid={`overlay-pen-${color}`}
              aria-label={`${color} pen`}
              aria-pressed={penColor === color}
              onClick={() => {
                setPenColor(color);
                updateSettings({ penColor: color });
              }}
              className={`h-5 w-5 rounded-full border-2 ${penColor === color ? "border-white" : "border-white/20"}`}
              style={{ backgroundColor: color === "red" ? "#ff3030" : color === "yellow" ? "#ffd60a" : "#30d158" }}
            />
          ))}
          <button
            type="button"
            data-testid="overlay-arrow-mode"
            aria-pressed={arrowMode}
            onClick={() => {
              const next = !arrowMode;
              setArrowMode(next);
              updateSettings({ arrowMode: next });
            }}
            className={`${segmentClass(arrowMode)} ml-1`}
          >
            Straight arrow
          </button>
          {(["box", "ellipse"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              data-testid={`overlay-shape-${kind}`}
              aria-pressed={shapeKind === kind}
              title="What the L gesture (thumb and index out) draws"
              onClick={() => {
                setShapeKind(kind);
                updateSettings({ shapeKind: kind });
              }}
              className={`${segmentClass(shapeKind === kind)} ml-1`}
            >
              {kind === "box" ? "Box" : "Ellipse"}
            </button>
          ))}
          <button
            type="button"
            data-testid="overlay-spotlight"
            aria-pressed={spotlightOn}
            onClick={() => {
              const next = !spotlightOn;
              setSpotlightOn(next);
              overlayRef.current?.compositor.setSpotlight(next);
            }}
            className={`${segmentClass(spotlightOn)} ml-1`}
          >
            Spotlight
          </button>
          <button type="button" data-testid="overlay-clear-drawing" onClick={() => overlayRef.current?.compositor.clearDrawing()} className={`${segmentClass(false)} ml-1`}>
            Clear drawing
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Stamp</span>
          {(["box", "ellipse", "text"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              data-testid={`overlay-stamp-${kind}`}
              aria-pressed={stampShapeKind === kind}
              title="What a thumb-to-middle-finger pinch drops, aimed by pointing"
              onClick={() => {
                setStampShapeKind(kind);
                updateSettings({ stampShapeKind: kind });
              }}
              className={`${segmentClass(stampShapeKind === kind)} ml-1`}
            >
              {kind === "box" ? "Rectangle" : kind === "ellipse" ? "Circle" : "Plain text"}
            </button>
          ))}
        </div>
        {pipWindow !== null && fileInput !== pipFileInputRef ? (
          <p className="text-[11px] text-white/60">Type the stamp text in the pop-out preview window.</p>
        ) : (
          <label className={labelClass}>
            Stamp text
            <input
              type="text"
              data-testid="overlay-stamp-text"
              value={stampText}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="Point, then thumb-to-middle pinch to drop it"
              onChange={(e) => {
                setStampText(e.target.value);
                updateSettings({ stampText: e.target.value });
              }}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white placeholder:text-white/40"
            />
          </label>
        )}
        <ShapeTextPanel
          shapes={shapes}
          prompt={shapePrompt}
          promptElsewhere={pipWindow !== null}
          onRemove={(id) => overlayRef.current?.compositor.removeShape(id)}
          onUndo={() => overlayRef.current?.compositor.undoShape()}
        />
      </div>

      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Chrome</span>
      <label className={labelClass}>
        Caption
        <input
          type="text"
          value={caption}
          maxLength={120}
          placeholder="Blank = the speaker's name"
          onChange={(e) => {
            setCaption(e.target.value);
            updateSettings({ caption: e.target.value });
          }}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white placeholder:text-white/40"
        />
      </label>

      <div className={labelClass}>
        Image
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleImage} />
        {imageName ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-white">{imageName}</span>
            <button type="button" onClick={clearImage} aria-label="Remove image" className="text-white/70 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 self-start rounded-md bg-white/5 px-2 py-1 text-white/80 hover:bg-white/10"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Add from your computer
          </button>
        )}
        {imageName && (
          <div className="grid grid-cols-2 gap-1">
            {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setImageCorner(value);
                  updateSettings({ imageCorner: value });
                }}
                className={segmentClass(imageCorner === value)}
              >
                {value.replace("-", " ")}
              </button>
            ))}
          </div>
        )}
      </div>
      </>
    );
  }

  /** The host-only list for one guest ability (pointing or drawing): the policy, and per guest their permission, a live marker, and Allow / Deny / Revoke. Never drawn into the stream. */
  function guestAbilityBlock(ability: GuestAbility) {
    const board = boardOf(ability);
    const policy = ability === "pointer" ? pointerPolicy : drawPolicy;
    const activeIds = ability === "pointer" ? pointingIds : drawingIds;
    const nouns = ability === "pointer" ? { title: "Guest pointers", setting: "Guests can point", live: "pointing", verb: "point" } : { title: "Guest drawing", setting: "Guests can draw", live: "drawing", verb: "draw" };
    return (
      <div className={labelClass} data-testid={`guest-${ability}s`}>
        <span className="text-white">{nouns.title}</span>
        <label className="flex items-center justify-between gap-2">
          {nouns.setting}
          <select
            value={policy}
            onChange={(e) => changeGuestPolicy(ability, e.target.value as PointerPolicy)}
            aria-label={nouns.setting}
            className="rounded-md border border-white/10 bg-white/10 px-1.5 py-1 text-xs text-white"
          >
            <option value="off">Off</option>
            <option value="ask">Ask me</option>
            <option value="on">On</option>
          </select>
        </label>
        {guests.length === 0 ? (
          <span className="text-white/50">Nobody else is in the showup session yet.</span>
        ) : (
          <ul className="space-y-1" data-version={pointerVersion}>
            {guests.map((guest) => {
              const shown = shownIdsRef.current.includes(guest.id);
              const status = board.status(guest.id, shown);
              const blocked = board.isBlocked(guest.id);
              const live = activeIds.includes(guest.id);
              const permission = blocked
                ? "Revoked"
                : status === "allowed"
                  ? `Can ${nouns.verb}`
                  : status === "pending"
                    ? `Wants to ${nouns.verb}`
                    : policy === "off"
                      ? "Off"
                      : board.permitted(guest.id)
                        ? `Can ${nouns.verb} when on the share`
                        : status === "ask"
                          ? "Can ask"
                          : "Not on the share";
              return (
                <li key={guest.id} className="flex items-center justify-between gap-2" data-testid={`guest-${ability}-row`}>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-white">
                    {live && (
                      <span
                        aria-label={`${nouns.live} now`}
                        data-testid={`guest-${nouns.live}`}
                        className="inline-block h-2 w-2 flex-none animate-pulse rounded-full"
                        style={{ backgroundColor: board.colorOf(guest.id) ?? "#22d3ee" }}
                      />
                    )}
                    <span className="truncate">{guest.label}</span>
                    {live && <span className="flex-none text-white/60">{nouns.live}</span>}
                  </span>
                  <span className="flex-none text-white/60">{permission}</span>
                  {status === "pending" ? (
                    <span className="flex flex-none gap-1">
                      <button type="button" onClick={() => decideGuestAbility(ability, guest.id, true)} className={segmentClass(true)}>
                        Allow
                      </button>
                      <button type="button" onClick={() => decideGuestAbility(ability, guest.id, false)} className={segmentClass(false)}>
                        Deny
                      </button>
                    </span>
                  ) : blocked ? (
                    <button type="button" onClick={() => allowGuestAbility(ability, guest.id)} className={`${segmentClass(false)} flex-none`}>
                      Allow
                    </button>
                  ) : board.permitted(guest.id) ? (
                    <button
                      type="button"
                      onClick={() => revokeGuestAbility(ability, guest.id)}
                      title={`Take this guest's ${ability === "pointer" ? "pointer" : "pen"} away`}
                      className={`${segmentClass(false)} flex-none`}
                    >
                      Revoke
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const pendingPointers = overlayOn ? pointerBoardRef.current.requesting : [];
  const pendingDrawers = overlayOn ? drawBoardRef.current.requesting : [];
  const pendingRequests = overlayOn ? roster.requesting : [];
  const requestsBlock =
    pendingRequests.length > 0 || pendingPointers.length > 0 || pendingDrawers.length > 0 ? (
      <div className={`space-y-1.5 rounded-lg border p-2 text-xs shadow-lg ${LK_PANEL_CLASS}`} role="alert" data-testid="overlay-requests">
        {pendingRequests.map((id) => (
          <div key={id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-white">{labelOf(id)} wants to appear on the share</span>
            <button type="button" onClick={() => decideRequest(id, true)} className={segmentClass(true)}>
              Allow
            </button>
            <button type="button" onClick={() => decideRequest(id, false)} className={segmentClass(false)}>
              Deny
            </button>
          </div>
        ))}
        {pendingPointers.map((id) => (
          <div key={`pointer-${id}`} className="flex items-center justify-between gap-2" data-testid="pointer-requests">
            <span className="min-w-0 flex-1 truncate text-white">{labelOf(id)} wants to use the pointer</span>
            <button type="button" onClick={() => decideGuestAbility("pointer", id, true)} className={segmentClass(true)}>
              Allow
            </button>
            <button type="button" onClick={() => decideGuestAbility("pointer", id, false)} className={segmentClass(false)}>
              Deny
            </button>
          </div>
        ))}
        {pendingDrawers.map((id) => (
          <div key={`draw-${id}`} className="flex items-center justify-between gap-2" data-testid="draw-requests">
            <span className="min-w-0 flex-1 truncate text-white">{labelOf(id)} wants to draw on the share</span>
            <button type="button" onClick={() => decideGuestAbility("draw", id, true)} className={segmentClass(true)}>
              Allow
            </button>
            <button type="button" onClick={() => decideGuestAbility("draw", id, false)} className={segmentClass(false)}>
              Deny
            </button>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div className="pointer-events-auto relative">
      {/*
        Fallback pop-out source for browsers without Document PiP: rendered
        invisibly rather than inline (an inline preview covered the meeting
        view, and the main tile already shows the share while this tab is
        open). It only needs to exist and be playing for video
        picture-in-picture.
      */}
      <video ref={previewRef} muted playsInline aria-hidden className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0" />
      <div className="flex items-center gap-2">
        {overlayOn ? (
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            className={`${LK_BUTTON_CLASS} ${LK_BUTTON_ACTIVE_CLASS}`}
            title="Camera overlay settings"
          >
            <Presentation className="h-4 w-4 text-red-400" />
            <span className="hidden sm:inline">Overlay settings</span>
            {pendingRequests.length > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{pendingRequests.length}</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={addOverlay}
            disabled={overlayStatus === "starting"}
            className={LK_BUTTON_CLASS}
            title="Show yourself translucently in front of your shared screen, so you can point at things"
          >
            <Presentation className="h-4 w-4" />
            <span className="hidden sm:inline">{overlayStatus === "starting" ? "Adding you…" : "Add me to the share"}</span>
          </button>
        )}
        <button
          type="button"
          onClick={openPreview}
          className={LK_BUTTON_CLASS}
          title="Pop out a preview that stays on top of other apps while you present — click it for settings"
        >
          <PictureInPicture2 className="h-4 w-4" />
          <span className="hidden sm:inline">Pop out preview</span>
        </button>
        {overlayOn && (
          <button type="button" onClick={removeOverlay} className={LK_BUTTON_CLASS} title="Back to a plain screen share">
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Remove me</span>
          </button>
        )}
      </div>
      {!panelOpen && requestsBlock && <div className="mt-2 w-72">{requestsBlock}</div>}
      {panelOpen && overlayOn && (
        <div
          ref={panelRef}
          style={panelPos ? { position: "fixed", left: panelPos.x, top: panelPos.y } : undefined}
          className={`${panelPos ? "" : `absolute ${panelPlacement === "above-right" ? "bottom-full right-0 mb-2" : "left-0 top-full mt-2"}`} w-72 rounded-lg border shadow-lg ${LK_PANEL_CLASS}`}
          data-testid="overlay-panel"
        >
          <div
            role="group"
            tabIndex={0}
            aria-label="Overlay settings. Drag to move, double-click to reset, or use the arrow keys."
            data-testid="overlay-panel-header"
            title="Drag to move, double-click to put it back"
            className="flex cursor-grab touch-none select-none items-center gap-1 rounded-t-lg border-b border-white/10 px-2 py-1.5 active:cursor-grabbing"
            onPointerDown={(event) => {
              if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
              const rect = panelRef.current?.getBoundingClientRect();
              if (!rect) return;
              const origin = { x: rect.left, y: rect.top };
              dragRef.current = { origin, start: { x: event.clientX, y: event.clientY }, last: origin };
              event.currentTarget.setPointerCapture(event.pointerId);
              setPanelPos(origin);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              drag.last = dragPanelPosition(drag.origin, drag.start, { x: event.clientX, y: event.clientY }, panelSize(), { width: window.innerWidth, height: window.innerHeight });
              setPanelPos(drag.last);
            }}
            onPointerUp={() => {
              const drag = dragRef.current;
              if (!drag) return;
              dragRef.current = null;
              savePanel(drag.last, panelCollapsed);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              setPanelPos(null);
              savePanel(null, panelCollapsed);
            }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              const rect = panelRef.current?.getBoundingClientRect();
              const base = panelPos ?? (rect ? { x: rect.left, y: rect.top } : null);
              if (!base) return;
              const next = nudgePanelPosition(base, event.key, event.shiftKey, panelSize(), { width: window.innerWidth, height: window.innerHeight });
              if (!next) return;
              event.preventDefault();
              setPanelPos(next);
              savePanel(next, panelCollapsed);
            }}
          >
            <GripHorizontal className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">Overlay settings</span>
            <button
              type="button"
              data-testid="overlay-panel-collapse"
              aria-expanded={!panelCollapsed}
              aria-label={panelCollapsed ? "Expand overlay settings" : "Collapse overlay settings"}
              title={panelCollapsed ? "Expand" : "Collapse to just this bar"}
              onClick={() => {
                const next = !panelCollapsed;
                setPanelCollapsed(next);
                savePanel(panelPos, next);
              }}
              className="rounded p-0.5 hover:bg-white/10"
            >
              {panelCollapsed ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
            </button>
            <button
              type="button"
              data-testid="overlay-panel-close"
              aria-label="Close overlay settings"
              title="Close"
              onClick={() => setPanelOpen(false)}
              className="rounded p-0.5 hover:bg-white/10"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {!panelCollapsed && <div className="max-h-[60vh] space-y-3 overflow-y-auto p-3">{settingsFields(fileInputRef)}</div>}
        </div>
      )}
      {pipWindow &&
        createPortal(
          <div className="flex h-screen flex-col bg-black font-sans text-white">
            {!pipPanelOpen && requestsBlock}
            <div className="relative min-h-0 flex-1">
              <video
                ref={pipVideoRef}
                muted
                playsInline
                autoPlay
                onClick={togglePipPanel}
                title={pipPanelOpen ? "Click to hide settings" : "Click for settings"}
                className="absolute inset-0 h-full w-full cursor-pointer object-contain"
              />
              {!pipPanelOpen && (
                <span className="pointer-events-none absolute bottom-1 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70">
                  Click for settings
                </span>
              )}
            </div>
            {pendingShapeId !== null && (
              // The label prompt floats here, over the window being shared, so the host can type without leaving it.
              <div className="flex-none border-t border-white/20 bg-[#1d1d1d] p-2">
                <ShapePromptField prompt={shapePrompt} compact />
              </div>
            )}
            {pipPanelOpen && (
              <div className={`max-h-[70%] flex-none space-y-3 overflow-y-auto border-t p-3 ${LK_PANEL_CLASS}`}>
                {settingsFields(pipFileInputRef)}
              </div>
            )}
          </div>,
          pipWindow.document.body,
        )}
    </div>
  );
}
