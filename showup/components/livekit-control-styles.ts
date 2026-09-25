/**
 * Dark-theme control styling matching LiveKit's own `.lk-button` (from
 * `--lk-control-bg`/`--lk-control-hover-bg`/`--lk-border-radius` in
 * `data-lk-theme="default"`, which is always dark regardless of the app's
 * own light/dark mode). Hardcoded rather than reusing the `.lk-button`
 * class directly: that class's colors come from CSS custom properties
 * scoped to `[data-lk-theme]`, which is set on <LiveKitRoom>'s own root —
 * these controls render as siblings of it (see TopLeftOverlay), outside
 * that scope, so the variables wouldn't resolve. Reported 2026-08-26: the
 * previous light pill/backdrop-blur look read as visually disconnected
 * from the actual control bar right below it.
 */
// px shrinks on mobile since the label text collapses to icon-only there
// (see each button's own `hidden sm:inline` span) — same `sm` (640px)
// breakpoint LiveKit's own ControlBar auto-switches to icon-only around.
export const LK_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-lg bg-[#1d1d1d] px-2.5 py-2.5 sm:px-4 text-sm text-white hover:bg-[#2a2a2a] disabled:opacity-50";
export const LK_BUTTON_ACTIVE_CLASS = "bg-[#373737] hover:bg-[#373737]";
/** Matches `--lk-border-color: rgba(255,255,255,.1)` — for dropdown panels and badges in the meeting overlays, same dark-theme-consistency rationale as LK_BUTTON_CLASS. */
export const LK_PANEL_CLASS = "border-white/10 bg-[#1d1d1d] text-white";
