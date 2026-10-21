"use client";

import { useEffect, useRef } from "react";
import type { Room } from "livekit-client";

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

/**
 * Keeps the local participant's away attribute in sync with page
 * visibility. `watching` (the meeting pop-out is open — see
 * components/calendar/meeting-pip.tsx) overrides a hidden page: someone
 * following the meeting in a floating window isn't away, and on desktop
 * their camera is still live. Best-effort: a phone may freeze the page right
 * after `visibilitychange`, so the update is fire-and-forget rather than
 * awaited.
 */
export function useAwayPresence(room: Room | null, watching = false) {
  // Last value sent for this room — kept across effect re-runs so a change of `watching` alone doesn't resend.
  const sentRef = useRef<{ room: Room | null; value: string }>({ room: null, value: "" });

  useEffect(() => {
    if (!room) return;
    const activeRoom = room;
    if (sentRef.current.room !== activeRoom) sentRef.current = { room: activeRoom, value: "" };

    function sync() {
      if (activeRoom.state !== "connected") return;
      const next = document.visibilityState === "hidden" && !watching ? "1" : "";
      if (next === sentRef.current.value) return;
      sentRef.current.value = next;
      // An empty string deletes the attribute.
      activeRoom.localParticipant.setAttributes({ [AWAY_ATTR]: next }).catch((error) => {
        sentRef.current.value = "";
        console.warn("[presence] Failed to update away status", error);
      });
    }

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [room, watching]);
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
