"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Track } from "livekit-client";
import {
  Chat,
  CarouselLayout,
  ConnectionStateToast,
  ControlBar,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  RoomAudioRenderer,
  useCreateLayoutContext,
  useTracks,
  type WidgetState,
} from "@livekit/components-react";
import { HandAwareTile } from "@/components/calendar/raise-hand";

/**
 * When the bottom control bar drops its text labels and goes icon-only. LiveKit's ControlBar does this on its
 * own at 760px (1000px with chat open), but that only accounts for its own buttons — with our `barExtra`
 * buttons beside it, the labelled bar is wider than a landscape phone (~850–930px), and the overflow pushed
 * Microphone off the left edge, where it couldn't be reached (reported 2026-10-21: members couldn't unmute
 * unless the phone was in portrait). These widths fit the full labelled bar (measured); with chat open the
 * chat panel (`55ch`) takes its share of the width too.
 */
const COMPACT_BAR_QUERY = "(max-width: 1279px)";
const COMPACT_BAR_WITH_CHAT_QUERY = "(max-width: 1719px)";

/**
 * How far the bar row's top edge sits above the bottom of the screen, published as a CSS variable for overlays
 * positioned just above it from outside `<LiveKitRoom>` (QuickRecordingOverlay). It's one 69px row on most
 * screens but wraps to two in portrait, where a hardcoded 69px would put the overlay on top of the bar's first
 * row. Measured from the top edge rather than as the bar's height: LiveKit sizes the stage as
 * `100% - --lk-control-bar-height`, so a shorter icon-only bar leaves a gap below it.
 */
export const BAR_CLEARANCE_VAR = "--nasiha-control-bar-clearance";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Replaces LiveKit's `VideoConference` prefab (Camera Overlay / Co-Ghosts
 * De-Duplication initiative) so a co-ghost's camera tile can be hidden from
 * the grid while they're on the presenter overlay — `VideoConference` has no
 * prop, render override or subscription hook that exposes for excluding one
 * participant's tile (confirmed against its source), so filtering which
 * tiles render means calling `useTracks` ourselves instead of through the
 * closed prefab. Ported from showup/components/showup-room.tsx's
 * `ShareStage`, which has run this same replacement in production; the one
 * deliberate divergence is `withPlaceholder: true` for Camera below, so a
 * participant with their camera off still gets an avatar-placeholder tile —
 * matching what `VideoConference` already showed in Nasiha, whereas
 * Showup's version (no camera-off attendees expected there) omits it
 * entirely.
 *
 * `barExtra` is optional extra button(s) for the bottom control bar (the prefab ControlBar takes no children).
 *
 * `overlayIds` is who's currently a ghost on the shared screen (the host,
 * plus up to 2 co-ghosts — see PresenterOverlayControl's overlay-roster
 * broadcast and OverlayGuestControl's receipt of it); their camera track is
 * filtered out of `cameras` below since they already appear via the ghost
 * on the share itself. Everyone else's camera tile (on or off) renders
 * exactly as it always has.
 */
export function ShareStage({ overlayIds, barExtra }: { overlayIds: string[]; barExtra?: ReactNode }) {
  const layoutContext = useCreateLayoutContext();
  const [widgetState, setWidgetState] = useState<WidgetState>({ showChat: false, unreadMessages: 0, showSettings: false });
  const compact = useMediaQuery(widgetState.showChat ? COMPACT_BAR_WITH_CHAT_QUERY : COMPACT_BAR_QUERY);
  const variation = compact ? "minimal" : "verbose";
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty(BAR_CLEARANCE_VAR, `${window.innerHeight - bar.getBoundingClientRect().top}px`);
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty(BAR_CLEARANCE_VAR);
    };
  }, []);
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false },
  );
  const screenShares = tracks.filter((track) => track.source === Track.Source.ScreenShare);
  const cameras = tracks.filter((track) => track.source === Track.Source.Camera && !overlayIds.includes(track.participant.identity));

  let stage;
  if (screenShares.length > 0 && cameras.length > 0) {
    stage = (
      <div className="lk-focus-layout-wrapper">
        <FocusLayoutContainer>
          <CarouselLayout tracks={cameras}>
            <HandAwareTile />
          </CarouselLayout>
          <FocusLayout trackRef={screenShares[0]} />
        </FocusLayoutContainer>
      </div>
    );
  } else {
    stage = (
      <div className="lk-grid-layout-wrapper">
        <GridLayout tracks={[...screenShares, ...cameras]}>
          <HandAwareTile />
        </GridLayout>
      </div>
    );
  }

  return (
    <div className="lk-video-conference">
      <LayoutContextProvider value={layoutContext} onWidgetChange={setWidgetState}>
        <div className="lk-video-conference-inner">
          {stage}
          {barExtra ? (
            // ControlBar renders no children, so an extra bar button (Raise hand) sits in a row beside it. The row
            // takes over the bar's own background/top border so the two read as one bar, centered together. It
            // wraps rather than overflowing, as a backstop should the bar ever outgrow COMPACT_BAR_QUERY again:
            // an overflowing centered row clips both ends unreachably, and a scrolling one would clip the device,
            // reaction and background menus that pop up above the bar. `nasiha-bar-label` is BAR_LABEL_CLASS, spelled out
            // so Tailwind's class scanner sees it.
            <div
              ref={barRef}
              className={`flex flex-wrap items-center justify-center ${compact ? "[&_.nasiha-bar-label]:hidden" : ""}`}
              style={{ background: "var(--lk-bg2)", borderTop: "1px solid var(--lk-border-color)" }}
            >
              <ControlBar
                variation={variation}
                controls={{ chat: true, settings: false }}
                style={{ borderTop: "none", flex: "none", background: "none" }}
              />
              <div className="flex items-center gap-2 pr-3">{barExtra}</div>
            </div>
          ) : (
            <ControlBar variation={variation} controls={{ chat: true, settings: false }} />
          )}
        </div>
        <Chat style={{ display: widgetState.showChat ? "grid" : "none" }} />
      </LayoutContextProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}
