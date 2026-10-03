// Custom Umami events for the live-event notices (popup / phone drawer /
// top strip) so their effectiveness can be compared. Umami Cloud is cookieless
// and the script is only loaded when NEXT_PUBLIC_UMAMI_WEBSITE_ID is set
// (components/analytics.tsx), so `window.umami` is simply absent in dev and
// every call below is then a no-op. Never send personal data or event titles —
// just the surface, the state and the device class.

export type NoticeSurface = "popup" | "drawer" | "strip";
export type NoticeAction = "shown" | "click" | "collapse" | "dismiss";
export type NoticeDevice = "phone" | "desktop";

type UmamiWindow = Window & { umami?: { track?: (name: string, data?: Record<string, string | number | boolean>) => void } };

export function trackNotice(action: NoticeAction, surface: NoticeSurface, state: string, device: NoticeDevice) {
  try {
    (window as UmamiWindow).umami?.track?.(`live-notice-${action}`, { surface, state, device });
  } catch {
    // Analytics must never break the UI.
  }
}

const shown = new Set<string>();

/** "shown" fires once per (surface, notice key) per page load, not on every poll/re-render. */
export function trackNoticeShown(surface: NoticeSurface, key: string, state: string, device: NoticeDevice) {
  const id = `${surface}|${key}`;
  if (shown.has(id)) return;
  shown.add(id);
  trackNotice("shown", surface, state, device);
}

/** True for the buttons/links that are the notice's real action (not dismiss/snooze/collapse/"+N more"). */
export function isPrimaryActionTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target.closest("button, a") : null;
  return el !== null && !el.closest("[data-live-secondary]");
}
