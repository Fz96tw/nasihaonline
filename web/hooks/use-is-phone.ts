"use client";

import { useSyncExternalStore } from "react";

/**
 * "Phone" = a viewport below Tailwind's `sm` breakpoint (640px wide — what a
 * phone reports in portrait), OR a touch device that is short (< 500px tall —
 * a phone held sideways is ~850px wide but only ~390px tall, where a floating
 * card plus a top strip would eat most of the screen). Tablets and desktop
 * windows keep the popup + strip. This is viewport-based, not device sniffing:
 * a desktop browser window dragged narrower than 640px gets the drawer too.
 */
const QUERY = "(max-width: 639px), (max-height: 499px) and (pointer: coarse)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * True below the `sm` breakpoint. Server/first render is `false` (desktop) so
 * static marketing pages hydrate without a mismatch; the live-event surfaces
 * only show after a client-side fetch anyway, so nothing flashes.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
