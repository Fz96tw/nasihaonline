"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` every `intervalMs`, but only while the tab is visible.
 * Hidden tabs stop polling (so a forgotten background tab doesn't keep the
 * user's "Last seen" fresh); on becoming visible again it fires once
 * immediately, then resumes the interval. Does not run `callback` on mount —
 * callers do their own initial fetch.
 */
export function useVisibleInterval(callback: () => void, intervalMs: number): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let id: number | null = null;

    const start = () => {
      if (id === null) id = window.setInterval(() => callbackRef.current(), intervalMs);
    };
    const stop = () => {
      if (id !== null) {
        window.clearInterval(id);
        id = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        callbackRef.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [intervalMs]);
}
