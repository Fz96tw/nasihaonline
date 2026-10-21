"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Expand, LogOut, Mic, MicOff, PictureInPicture2, X } from "lucide-react";
import { Track, type RemoteTrack } from "livekit-client";
import {
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
  useRoomContext,
  useSpeakingParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { BAR_LABEL_CLASS, LK_BUTTON_CLASS } from "@/components/calendar/livekit-control-styles";
import { copyStyleSheets, documentPictureInPicture } from "@/components/calendar/presenter-overlay-control";
import { BAR_CLEARANCE_VAR } from "@/components/calendar/share-stage";

/**
 * Meeting picture-in-picture (member request, 2026-10-21): keeps the meeting
 * visible in a floating window while the viewer works in another tab or app.
 *
 * - Chrome/Edge: a Document Picture-in-Picture window (same API as the
 *   presenter overlay's pop-out preview) showing the featured video plus
 *   Mic and Leave buttons. Chrome also opens it on its own when the viewer
 *   switches tabs, via the Media Session `enterpictureinpicture` action it
 *   offers video-call pages.
 * - Everywhere else with video PiP (Safari incl. iPhone, Android): a plain
 *   video PiP of the featured video, from a hidden <video> kept on the
 *   featured track. No buttons — the browser's own window has none to give.
 * - Phones also get Full screen: the native player, which iPhone and Android
 *   float automatically when the viewer leaves for another app. A phone
 *   can't open PiP from a plain app switch — it needs a tap first.
 *
 * Rendered in the control bar, inside <LiveKitRoom>, so a rejoin (which
 * remounts the room) or leaving the meeting unmounts it and closes any
 * open window.
 */

const PIP_WIDTH = 480;
const PIP_HEIGHT = 320;
const TIP_STORAGE_KEY = "nasiha:pip-tip-dismissed";

type PipSupport = { documentPip: boolean; videoPip: boolean; fullscreen: boolean; coarsePointer: boolean };

type WebKitVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
};

/** Checked after mount (not during render) so SSR/hydration agree, same as the presenter overlay's own check. */
function detectSupport(): PipSupport {
  const probe = document.createElement("video") as WebKitVideoElement;
  return {
    documentPip: !!documentPictureInPicture(),
    videoPip:
      (document.pictureInPictureEnabled && typeof probe.requestPictureInPicture === "function") ||
      !!probe.webkitSupportsPresentationMode?.("picture-in-picture"),
    fullscreen: typeof probe.webkitEnterFullscreen === "function" || typeof probe.requestFullscreen === "function",
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  };
}

function usePipSupport(): PipSupport | null {
  const [support, setSupport] = useState<PipSupport | null>(null);
  useEffect(() => setSupport(detectSupport()), []);
  return support;
}

/**
 * Who the floating window shows: someone else's screen share first, then
 * whoever spoke last (kept after they stop, so the window doesn't flick
 * back between every sentence), then the first other camera, then the
 * viewer's own. Remote over local throughout — nobody needs a floating
 * window of themselves.
 */
function useFeaturedTrack(): TrackReferenceOrPlaceholder | null {
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false },
  );
  const speakers = useSpeakingParticipants();
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);

  const currentSpeaker = speakers.find((participant) => !participant.isLocal)?.identity;
  useEffect(() => {
    if (currentSpeaker) setLastSpeaker(currentSpeaker);
  }, [currentSpeaker]);

  const share =
    tracks.find((ref) => ref.source === Track.Source.ScreenShare && !ref.participant.isLocal) ??
    tracks.find((ref) => ref.source === Track.Source.ScreenShare);
  if (share) return share;
  const cameras = tracks.filter((ref) => ref.source === Track.Source.Camera);
  return (
    cameras.find((ref) => ref.participant.identity === lastSpeaker) ??
    cameras.find((ref) => !ref.participant.isLocal) ??
    cameras[0] ??
    null
  );
}

/** The video track to show in a plain video PiP / full screen, which can't show a camera-off placeholder. */
function videoTrackOf(ref: TrackReferenceOrPlaceholder | null) {
  return ref && isTrackReference(ref) && !ref.publication.isMuted ? ref.publication.track ?? null : null;
}

/** Contents of the Document PiP window — portaled into it, so it shares this tree's LiveKit context. */
function PipWindowView({ trackRef, onLeave }: { trackRef: TrackReferenceOrPlaceholder | null; onLeave: () => void }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const name = trackRef ? trackRef.participant.name || trackRef.participant.identity : "";
  const showVideo = trackRef && isTrackReference(trackRef) && !trackRef.publication.isMuted;
  const sharing = trackRef?.source === Track.Source.ScreenShare;

  return (
    <div className="flex h-screen flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1">
        {showVideo ? (
          <VideoTrack trackRef={trackRef} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-lg font-medium text-white/80">
            {name || "Waiting for others to join"}
          </div>
        )}
        {name && (
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs">
            {sharing ? `${name}'s screen` : name}
          </span>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 bg-[#111] p-2">
        <button
          type="button"
          onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled).catch(() => {})}
          aria-pressed={isMicrophoneEnabled}
          className={LK_BUTTON_CLASS}
        >
          {isMicrophoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-red-400" />}
          {isMicrophoneEnabled ? "Mute" : "Unmute"}
        </button>
        <button type="button" onClick={onLeave} className={`${LK_BUTTON_CLASS} text-red-400`}>
          <LogOut className="h-4 w-4" />
          Leave
        </button>
      </div>
    </div>
  );
}

/**
 * Pop out (and, on phones, Full screen) buttons for the meeting's bottom control bar. `onOpenChange` reports
 * whether a pop-out is open, so the viewer isn't shown as Away while watching it (see useAwayPresence).
 */
export function MeetingPipControl({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const room = useRoomContext();
  const support = usePipSupport();
  const featured = useFeaturedTrack();
  const featuredVideo = videoTrackOf(featured);
  const videoRef = useRef<WebKitVideoElement>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [videoPipOpen, setVideoPipOpen] = useState(false);

  // Keep the hidden <video> on the featured track; a video PiP window follows its element, so swapping the track
  // here swaps what's floating too.
  useEffect(() => {
    const element = videoRef.current;
    if (!element || !featuredVideo) return;
    const track = featuredVideo as RemoteTrack;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [featuredVideo]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const onLeavePip = () => setVideoPipOpen(false);
    const onEnterPip = () => setVideoPipOpen(true);
    element.addEventListener("leavepictureinpicture", onLeavePip);
    element.addEventListener("enterpictureinpicture", onEnterPip);
    return () => {
      element.removeEventListener("leavepictureinpicture", onLeavePip);
      element.removeEventListener("enterpictureinpicture", onEnterPip);
    };
  }, []);

  // Leaving the meeting (or a rejoin remounting the room) takes any floating window with it.
  useEffect(() => {
    const element = videoRef.current;
    return () => {
      pipWindowRef.current?.close();
      if (element && document.pictureInPictureElement === element) document.exitPictureInPicture().catch(() => {});
    };
  }, []);

  async function openDocumentPip(): Promise<boolean> {
    const documentPip = documentPictureInPicture();
    if (!documentPip) return false;
    try {
      const pip = await documentPip.requestWindow({ width: PIP_WIDTH, height: PIP_HEIGHT });
      copyStyleSheets(pip);
      pip.document.title = "Meeting";
      pip.document.body.style.margin = "0";
      pip.document.body.style.background = "#000";
      pip.addEventListener("pagehide", () => {
        pipWindowRef.current = null;
        setPipWindow(null);
      });
      pipWindowRef.current = pip;
      setPipWindow(pip);
      return true;
    } catch (error) {
      console.warn("[meeting-pip] document picture-in-picture failed, using video picture-in-picture", error);
      return false;
    }
  }

  async function openVideoPip() {
    const element = videoRef.current;
    if (!element) return;
    try {
      if (typeof element.requestPictureInPicture === "function") {
        await element.requestPictureInPicture();
      } else {
        (element as unknown as { webkitSetPresentationMode: (mode: string) => void }).webkitSetPresentationMode(
          "picture-in-picture",
        );
      }
    } catch (error) {
      console.warn("[meeting-pip] video picture-in-picture failed", error);
    }
  }

  async function openPip() {
    if (pipWindowRef.current) {
      pipWindowRef.current.focus();
      return;
    }
    if (await openDocumentPip()) return;
    if (featuredVideo) await openVideoPip();
  }

  function closePip() {
    pipWindowRef.current?.close();
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  }

  const openPipRef = useRef(openPip);
  openPipRef.current = openPip;

  // Chrome's automatic picture-in-picture for video-call pages: when the viewer switches tabs or apps, it fires
  // this action, and the handler may open a window without a click. Browsers without the action throw here.
  useEffect(() => {
    if (!support || (!support.documentPip && !support.videoPip) || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => {
        void openPipRef.current();
      });
    } catch {
      return;
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {
        // see above
      }
    };
  }, [support]);

  function enterFullscreen() {
    const element = videoRef.current;
    if (!element) return;
    if (typeof element.webkitEnterFullscreen === "function") {
      element.webkitEnterFullscreen();
    } else {
      element.requestFullscreen().catch((error) => console.warn("[meeting-pip] full screen failed", error));
    }
  }

  const pipOpen = !!pipWindow || videoPipOpen;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    onOpenChangeRef.current?.(pipOpen);
  }, [pipOpen]);
  useEffect(() => () => onOpenChangeRef.current?.(false), []);

  const canPip = !!support && (support.documentPip || (support.videoPip && !!featuredVideo));
  const showFullscreen = !!support && support.coarsePointer && support.fullscreen && !!featuredVideo;

  return (
    <>
      {/* Source for plain video PiP and full screen. Kept in the layout (not display:none, which some browsers
          refuse to float) but invisible, until the browser makes it the full-screen element. */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0 [&:fullscreen]:h-full [&:fullscreen]:w-full [&:fullscreen]:bg-black [&:fullscreen]:opacity-100"
      />
      {support && (support.documentPip || support.videoPip) && (
        <button
          type="button"
          className="lk-button"
          onClick={() => (pipOpen ? closePip() : void openPip())}
          disabled={!canPip && !pipOpen}
          aria-pressed={pipOpen}
          aria-label={pipOpen ? "Close pop-out" : "Pop out"}
          title={canPip || pipOpen ? "Keep the meeting in a floating window" : "Nobody's video is on yet"}
        >
          <PictureInPicture2 className="h-4 w-4" />
          <span className={BAR_LABEL_CLASS}>{pipOpen ? "Close pop-out" : "Pop out"}</span>
        </button>
      )}
      {showFullscreen && (
        <button type="button" className="lk-button" onClick={enterFullscreen} aria-label="Full screen" title="Full screen">
          <Expand className="h-4 w-4" />
          <span className={BAR_LABEL_CLASS}>Full screen</span>
        </button>
      )}
      {pipWindow &&
        createPortal(<PipWindowView trackRef={featured} onLeave={() => room.disconnect()} />, pipWindow.document.body)}
    </>
  );
}

/**
 * One-time hint for phones, where picture-in-picture can't open on its own: tap first, then switch apps.
 * A sibling of <LiveKitRoom> (overlays nested inside it have rendered invisibly before — see
 * ParticipantActivityListener), sitting just above the control bar. Dismissal is remembered per device.
 */
export function MeetingPipTip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const support = detectSupport();
    if (!support.coarsePointer || !(support.documentPip || support.videoPip || support.fullscreen)) return;
    try {
      if (window.localStorage.getItem(TIP_STORAGE_KEY)) return;
    } catch {
      // Storage unavailable — show it; it just won't be remembered.
    }
    setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(TIP_STORAGE_KEY, "1");
    } catch {
      // see above
    }
  }

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: `calc(var(${BAR_CLEARANCE_VAR}, 69px) + 0.75rem)` }}
    >
      <div className="pointer-events-auto relative max-w-sm rounded-lg border border-white/10 bg-[#1d1d1d] py-2 pl-3 pr-8 text-sm text-white shadow-lg">
        {/* The bar is icon-only on phones, so the tip shows the icons, not just the names. */}
        Tap <PictureInPicture2 aria-hidden className="inline h-4 w-4 align-text-bottom" />{" "}
        <span className="font-medium">Pop out</span> or <Expand aria-hidden className="inline h-4 w-4 align-text-bottom" />{" "}
        <span className="font-medium">Full screen</span> before switching apps to keep watching.
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-1.5 top-1.5 rounded-sm p-0.5 text-white/60 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
