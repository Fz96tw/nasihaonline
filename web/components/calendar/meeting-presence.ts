"use client";

import { useEffect, useRef } from "react";
import { ConnectionState, RoomEvent, type Room } from "livekit-client";

/**
 * "Away" presence (Nasiha Conference). Set while this participant's meeting
 * page is hidden — a mobile app switch, or another tab on desktop — so
 * everyone else sees why their camera went dark instead of wondering
 * whether they left. Same mechanism as raise hand (components/calendar/
 * raise-hand.tsx): a participant attribute the client sets on itself, which
 * LiveKit pushes to everyone and drops when the participant disconnects, so
 * it can never outlive them. A rejoin is a fresh session that starts
 * without it.
 */
export const AWAY_ATTR = "away";

/** Wait before retrying an away update that failed (e.g. timed out mid-reconnect). */
const AWAY_RETRY_MS = 2_000;

/**
 * Keeps the local participant's away attribute in sync with page
 * visibility. `watching` (the meeting pop-out is open — see
 * components/calendar/meeting-pip.tsx) overrides a hidden page: someone
 * following the meeting in a floating window isn't away, and on desktop
 * their camera is still live.
 *
 * Converges on the attribute LiveKit actually holds rather than trusting
 * what was last sent, one update at a time, retrying after a failure and
 * re-checking whenever the connection comes back. Trusting the last send
 * left members stuck as Away (reported 2026-10-21): returning while the
 * connection was briefly reconnecting skipped the clear entirely, and
 * setAttributes "times out" whenever a later update overtakes it (it waits
 * up to 5s to see its own value echoed back), so a quick switch away and
 * back could record a clear that never landed.
 */
export function useAwayPresence(room: Room | null, watching = false) {
  const watchingRef = useRef(watching);
  watchingRef.current = watching;
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!room) return;
    const activeRoom = room;
    let inFlight = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    function sync() {
      if (disposed || inFlight || activeRoom.state !== ConnectionState.Connected) return;
      const wanted = document.visibilityState === "hidden" && !watchingRef.current ? "1" : "";
      if ((activeRoom.localParticipant.attributes[AWAY_ATTR] ?? "") === wanted) return;
      inFlight = true;
      clearTimeout(retryTimer);
      // An empty string deletes the attribute.
      activeRoom.localParticipant.setAttributes({ [AWAY_ATTR]: wanted }).then(
        () => {
          inFlight = false;
          sync();
        },
        (error) => {
          inFlight = false;
          console.warn("[presence] Failed to update away status", error);
          retryTimer = setTimeout(sync, AWAY_RETRY_MS);
        },
      );
    }

    syncRef.current = sync;
    sync();
    document.addEventListener("visibilitychange", sync);
    activeRoom.on(RoomEvent.ConnectionStateChanged, sync);
    activeRoom.on(RoomEvent.ParticipantAttributesChanged, sync);
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      syncRef.current = () => {};
      document.removeEventListener("visibilitychange", sync);
      activeRoom.off(RoomEvent.ConnectionStateChanged, sync);
      activeRoom.off(RoomEvent.ParticipantAttributesChanged, sync);
    };
  }, [room]);

  useEffect(() => {
    syncRef.current();
  }, [watching]);
}

/**
 * Keeps the screen from locking during the meeting where the browser
 * supports the Screen Wake Lock API. The browser releases the lock whenever
 * the page is hidden, so it's re-requested each time the page becomes
 * visible again. Silently does nothing where unsupported or refused (e.g.
 * low battery mode).
 */
export function useScreenWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    async function acquire() {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed) {
          next.release().catch(() => {});
          return;
        }
        sentinel = next;
      } catch {
        // Refused or unavailable — the screen just locks on its normal timer.
      }
    }

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", acquire);
      sentinel?.release().catch(() => {});
    };
  }, []);
}
