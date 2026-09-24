"use client";

import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, PictureInPicture2, Presentation, X } from "lucide-react";
import { RoomEvent, Track, type LocalTrackPublication, type Room } from "livekit-client";
import {
  isPresenterOverlaySupported,
  startPresenterOverlayCompositor,
  type OverlayCorner,
  type PresenterOverlayCompositor,
  type PresenterOverlaySettings,
} from "@/lib/presenter-overlay/compositor";
import { LK_BUTTON_ACTIVE_CLASS, LK_BUTTON_CLASS, LK_PANEL_CLASS } from "@/components/calendar/livekit-control-styles";

type Session = {
  compositor: PresenterOverlayCompositor;
  screenTrack: MediaStreamTrack;
  cameraTrack: MediaStreamTrack;
  publication: LocalTrackPublication | null;
  /** Whether the presenter's regular camera tile was on before presenting — restored on stop. */
  cameraWasEnabled: boolean;
};

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
 * "Present with camera" (objective 961a9322) — a screen share with the
 * presenter's background-removed webcam drawn translucently over it, so
 * they can point at things on their slides. The combined video is
 * published as the regular ScreenShare source (see
 * lib/presenter-overlay/compositor.ts), so viewers and the recording see it
 * exactly where a normal screen share goes.
 *
 * Rendered in TopLeftOverlay, outside <LiveKitRoom>, so it takes the Room
 * via the same RoomExitBridge handoff the Exit button uses.
 *
 * Renders nothing on browsers without insertable streams (Firefox, Safari,
 * iOS) — those keep the plain ControlBar screen share. The check runs
 * after mount so SSR/hydration always agree on the initial (hidden) state.
 *
 * Stopping: this panel's Stop button, the browser's own "Stop sharing"
 * bar (the display track's `ended`), or ControlBar's share toggle (which
 * unpublishes the ScreenShare publication out from under us —
 * LocalTrackUnpublished) all funnel into the same teardown.
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
  const [status, setStatus] = useState<"idle" | "starting" | "active">("idle");
  // Starts collapsed — it sits over the meeting view; the "Presenting with camera" button toggles it.
  const [panelOpen, setPanelOpen] = useState(false);
  // Mirrors of the compositor's mutable settings, for rendering the controls.
  const [opacity, setOpacity] = useState(0.5);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<PresenterOverlaySettings["position"]>("center");
  const [mirror, setMirror] = useState(true);
  const [caption, setCaption] = useState("");
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageCorner, setImageCorner] = useState<OverlayCorner>("top-right");
  const sessionRef = useRef<Session | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Pop-out preview (Document PiP): the window, its own <video>/file input, and whether its settings panel is showing.
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipPanelOpen, setPipPanelOpen] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipFileInputRef = useRef<HTMLInputElement | null>(null);
  // teardown() runs from listeners/unmount cleanups registered on earlier renders — read the room through a ref so it's never stale.
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    setSupported(isPresenterOverlaySupported());
  }, []);

  function updateSettings(patch: Partial<PresenterOverlaySettings>) {
    const session = sessionRef.current;
    if (session) Object.assign(session.compositor.settings, patch);
  }

  async function teardown() {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    const room = roomRef.current;
    setStatus("idle");
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    pipWindowRef.current?.close();
    if (previewRef.current) previewRef.current.srcObject = null;
    session.compositor.settings.image?.close();
    setImageName(null);
    if (room && session.publication?.track && room.localParticipant.getTrackPublication(Track.Source.ScreenShare) === session.publication) {
      await room.localParticipant.unpublishTrack(session.publication.track).catch(() => {});
    }
    session.compositor.stop();
    session.screenTrack.stop();
    session.cameraTrack.stop();
    if (room && session.cameraWasEnabled) {
      await room.localParticipant.setCameraEnabled(true).catch(() => {});
    }
  }

  // Tear down on unmount (leaving the meeting).
  useEffect(() => {
    return () => {
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ControlBar's own share toggle unpublishes our track — treat that as Stop.
  useEffect(() => {
    if (!room) return;
    const onUnpublished = (publication: LocalTrackPublication) => {
      if (sessionRef.current?.publication && publication.trackSid === sessionRef.current.publication.trackSid) {
        teardown();
      }
    };
    room.on(RoomEvent.LocalTrackUnpublished, onUnpublished);
    return () => {
      room.off(RoomEvent.LocalTrackUnpublished, onUnpublished);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  async function start() {
    if (!room || status !== "idle") return;
    setStatus("starting");
    const { localParticipant } = room;
    let screenTrack: MediaStreamTrack | null = null;
    let cameraTrack: MediaStreamTrack | null = null;
    let compositor: PresenterOverlayCompositor | null = null;
    try {
      if (localParticipant.isScreenShareEnabled) await localParticipant.setScreenShareEnabled(false);

      // Picker first, while the click's user activation is still fresh.
      // (usePreventScreenShareSelfMirror's patch still applies here.)
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 20 }, audio: false });
      screenTrack = display.getVideoTracks()[0];

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
        screenTrack,
        cameraTrack,
        onError: (error) => {
          console.error("[presenter-overlay] compositor failed", error);
          onError("Presenting with camera stopped unexpectedly.");
          teardown();
        },
      });
      Object.assign(compositor.settings, { opacity, scale, position, mirror, caption: "", image: null, imageCorner });
      // Favor sharpness over smoothness — slide text matters more than motion.
      compositor.track.contentHint = "detail";

      // Hide the regular camera tile so the presenter doesn't appear twice.
      const cameraWasEnabled = localParticipant.isCameraEnabled;
      if (cameraWasEnabled) await localParticipant.setCameraEnabled(false);

      const session: Session = { compositor, screenTrack, cameraTrack, publication: null, cameraWasEnabled };
      sessionRef.current = session;
      screenTrack.addEventListener("ended", () => teardown());

      session.publication = await localParticipant.publishTrack(compositor.track, {
        source: Track.Source.ScreenShare,
        name: "presenter-overlay",
        simulcast: false,
        videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 20 },
      });

      setCaption("");
      setPanelOpen(false);
      setStatus("active");
    } catch (error) {
      console.error("[presenter-overlay] failed to start", error);
      if (sessionRef.current) {
        await teardown();
      } else {
        compositor?.stop();
        screenTrack?.stop();
        cameraTrack?.stop();
        setStatus("idle");
      }
      // The user closing the share picker isn't an error worth a toast.
      if (!(error instanceof DOMException && error.name === "NotAllowedError")) {
        onError("Couldn't start presenting with camera.");
      }
    }
  }

  /**
   * Opens the pop-out preview. Prefers Document Picture-in-Picture (Chrome
   * 116+), a floating always-on-top window that holds real page content:
   * the preview video, which toggles the settings panel when clicked, so
   * the presenter can adjust things without leaving their slides app.
   * Falls back to plain video picture-in-picture (preview only) where it's
   * unavailable. Either window can be moved and resized.
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

  // Attach the (hidden, fallback-PiP) preview once presenting starts.
  useEffect(() => {
    const video = previewRef.current;
    const session = sessionRef.current;
    if (status !== "active" || !video || !session) return;
    video.srcObject = new MediaStream([session.compositor.track]);
    video.play().catch(() => {});

    // Chrome auto-opens the pop-out when the presenter switches away from
    // the tab (camera-using sites only), so the preview follows them into
    // their slides app without a click.
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
  }, [status]);

  // Attach the pop-out window's own preview video once it's portaled in.
  useEffect(() => {
    const video = pipVideoRef.current;
    const session = sessionRef.current;
    if (!pipWindow || !video || !session) return;
    video.srcObject = new MediaStream([session.compositor.track]);
    video.play().catch(() => {});
  }, [pipWindow]);

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const session = sessionRef.current;
    if (!file || !session) return;
    try {
      // Decoded locally — the file itself is never uploaded anywhere.
      const bitmap = await createImageBitmap(file);
      session.compositor.settings.image?.close();
      updateSettings({ image: bitmap });
      setImageName(file.name);
    } catch {
      onError("Couldn't read that image.");
    }
  }

  function clearImage() {
    sessionRef.current?.compositor.settings.image?.close();
    updateSettings({ image: null });
    setImageName(null);
  }

  if (!supported) return null;

  if (status !== "active") {
    return (
      <button
        type="button"
        onClick={start}
        disabled={!room || status === "starting"}
        className={`pointer-events-auto ${LK_BUTTON_CLASS}`}
        title="Share your screen with yourself shown translucently in front of it"
      >
        <Presentation className="h-4 w-4" />
        <span className="hidden sm:inline">{status === "starting" ? "Starting…" : "Present with camera"}</span>
      </button>
    );
  }

  const labelClass = "flex flex-col gap-1 text-xs text-white/70";
  const segmentClass = (selected: boolean) =>
    `flex-1 rounded-md px-2 py-1 text-xs ${selected ? "bg-white/20 text-white" : "bg-white/5 text-white/70 hover:bg-white/10"}`;

  // Rendered twice when the pop-out is open (page panel + pop-out panel), each with its own file input.
  const settingsFields = (fileInput: RefObject<HTMLInputElement>) => (
    <>
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
          placeholder="Shown along the bottom"
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
        view, and the main tile already shows the combined share while this
        tab is open). It only needs to exist and be playing for video
        picture-in-picture. Not CSS-mirrored — here or in the Document PiP
        window — since it's exactly what viewers see (any mirroring is baked
        in by the compositor).
      */}
      <video ref={previewRef} muted playsInline aria-hidden className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          className={`${LK_BUTTON_CLASS} ${LK_BUTTON_ACTIVE_CLASS}`}
        >
          <Presentation className="h-4 w-4 text-red-400" />
          <span className="hidden sm:inline">Presenting with camera</span>
        </button>
        <button
          type="button"
          onClick={openPreview}
          className={LK_BUTTON_CLASS}
          title="Pop out a preview that stays on top of other apps while you present — click it for settings"
        >
          <PictureInPicture2 className="h-4 w-4" />
          <span className="hidden sm:inline">Pop out preview</span>
        </button>
        <button type="button" onClick={() => teardown()} className={LK_BUTTON_CLASS}>
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">Stop</span>
        </button>
      </div>
      {panelOpen && (
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
