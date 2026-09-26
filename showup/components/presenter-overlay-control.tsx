"use client";

import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, PictureInPicture2, Presentation, X } from "lucide-react";
import { RoomEvent, Track, type LocalTrackPublication, type LocalVideoTrack, type Room } from "livekit-client";
import { SpeakerFollower } from "@/lib/presenter-overlay/speaker-follow";
import {
  isPresenterOverlaySupported,
  startPresenterOverlayCompositor,
  type OverlayCorner,
  type PresenterOverlayCompositor,
  type PresenterOverlaySettings,
} from "@/lib/presenter-overlay/compositor";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/livekit-control-styles";

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
  panelPlacement = "below-left",
}: {
  room: Room | null;
  onError: (message: string) => void;
  /** Where the settings panel opens: under the button (TopLeftOverlay), or above it for the bottom-right quick-recording controls, which sit right on top of LiveKit's control bar. */
  panelPlacement?: "below-left" | "above-right";
}) {
  const [supported, setSupported] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [overlayStatus, setOverlayStatus] = useState<"off" | "starting" | "on">("off");
  // Starts collapsed — it sits over the meeting view; the "Overlay settings" button toggles it.
  const [panelOpen, setPanelOpen] = useState(false);
  // Overlay settings — kept for the whole page, so turning the overlay off and on again restores them.
  const [opacity, setOpacity] = useState(0.5);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<PresenterOverlaySettings["position"]>("center");
  const [mirror, setMirror] = useState(true);
  const [caption, setCaption] = useState("");
  // Follow-the-speaker (default on) and an optional pinned person, who overrides it. Kept for the whole page like the other settings.
  const [followSpeaker, setFollowSpeaker] = useState(true);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [shownId, setShownId] = useState<string>(LOCAL_ID);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageCorner, setImageCorner] = useState<OverlayCorner>("top-right");
  const imageRef = useRef<ImageBitmap | null>(null);
  const followRef = useRef({ follow: true, pinned: null as string | null });
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
  }, []);

  function currentSettings(): PresenterOverlaySettings {
    return { opacity, scale, position, mirror, caption, autoCaption: true, image: imageRef.current, imageCorner };
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
    setPeople([]);
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
    room.remoteParticipants.forEach((participant) => {
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

    const speakers = new Map<string, number>();
    room.activeSpeakers.forEach((participant) => {
      if (participant.isSpeaking) speakers.set(participant.isLocal ? LOCAL_ID : participant.identity, participant.audioLevel);
    });
    const shown = follower.update(performance.now(), speakers, eligible, LOCAL_ID);
    compositor.setVisible([shown]);
    setShownId(shown);

    setPeople((previous) =>
      previous.length === nextPeople.length && previous.every((person, i) => person.id === nextPeople[i].id && person.label === nextPeople[i].label)
        ? previous
        : nextPeople,
    );
  }

  /** Swaps the untouched capture back in (full resolution, LiveKit-owned again), then disposes the overlay. */
  async function removeOverlay() {
    const share = shareRef.current;
    if (!overlayRef.current) return;
    if (share && share.track.mediaStreamTrack !== share.rawScreen) {
      await share.track.replaceTrack(share.rawScreen, { userProvidedTrack: false }).catch((error) => {
        console.error("[presenter-overlay] failed to restore the plain screen share", error);
      });
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
  const labelClass = "flex flex-col gap-1 text-xs text-white/70";
  const segmentClass = (selected: boolean) =>
    `flex-1 rounded-md px-2 py-1 text-xs ${selected ? "bg-white/20 text-white" : "bg-white/5 text-white/70 hover:bg-white/10"}`;

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

      <label className="flex items-center justify-between gap-2 text-xs text-white/70">
        Follow the speaker
        <input type="checkbox" checked={followSpeaker} onChange={(e) => changeFollow(e.target.checked)} />
      </label>
      {people.length > 1 && (
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

      <label className={labelClass}>
        Size ({Math.round(scale * 100)}%)
        <input
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

      <label className="flex items-center gap-2 text-xs text-white/70">
        <input
          type="checkbox"
          checked={mirror}
          onChange={(e) => {
            setMirror(e.target.checked);
            updateSettings({ mirror: e.target.checked });
          }}
        />
        Mirror me (point at things naturally)
      </label>

      <div className={labelClass}>
        Position
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((value) => (
            <button
              key={value}
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
      {panelOpen && overlayOn && (
        <div
          className={`absolute ${panelPlacement === "above-right" ? "bottom-full right-0 mb-2" : "left-0 top-full mt-2"} max-h-[60vh] w-72 space-y-3 overflow-y-auto rounded-lg border p-3 shadow-lg ${LK_PANEL_CLASS}`}
        >
          {settingsFields(fileInputRef)}
        </div>
      )}
      {pipWindow &&
        createPortal(
          <div className="flex h-screen flex-col bg-black font-sans text-white">
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
