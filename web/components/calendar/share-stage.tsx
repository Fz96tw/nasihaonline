"use client";

import { useState } from "react";
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
 * `overlayIds` is who's currently a ghost on the shared screen (the host,
 * plus up to 2 co-ghosts — see PresenterOverlayControl's overlay-roster
 * broadcast and OverlayGuestControl's receipt of it); their camera track is
 * filtered out of `cameras` below since they already appear via the ghost
 * on the share itself. Everyone else's camera tile (on or off) renders
 * exactly as it always has.
 */
export function ShareStage({ overlayIds }: { overlayIds: string[] }) {
  const layoutContext = useCreateLayoutContext();
  const [widgetState, setWidgetState] = useState<WidgetState>({ showChat: false, unreadMessages: 0, showSettings: false });
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
          <ControlBar controls={{ chat: true, settings: false }} />
        </div>
        <Chat style={{ display: widgetState.showChat ? "grid" : "none" }} />
      </LayoutContextProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}
