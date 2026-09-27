/**
 * Where the host's floating overlay settings panel sits: pure helpers with no DOM, so the rules can be tested.
 * A position is the panel's top-left corner in window pixels; `null` means "the default spot".
 */

export type PanelPosition = { x: number; y: number };
export type PanelSize = { width: number; height: number };
export type Viewport = { width: number; height: number };
export type StoredPanel = { position: PanelPosition | null; collapsed: boolean };

/** How much of the panel's header must stay inside the window, so it can always be grabbed again. */
export const GRAB_MARGIN = 48;
/** Header height reserved at the top and bottom edge (the header is the only part that has to stay reachable). */
export const HEADER_HEIGHT = 32;
/** Pixels an arrow key moves the panel; with Shift, a bigger step. */
export const NUDGE_STEP = 10;
export const NUDGE_STEP_LARGE = 50;

/** Keeps at least GRAB_MARGIN of the panel's width, and its whole header, inside the window. */
export function clampPanelPosition(position: PanelPosition, size: PanelSize, viewport: Viewport): PanelPosition {
  const minX = GRAB_MARGIN - size.width;
  const maxX = Math.max(minX, viewport.width - GRAB_MARGIN);
  const minY = 0;
  const maxY = Math.max(minY, viewport.height - HEADER_HEIGHT);
  return {
    x: Math.round(Math.min(maxX, Math.max(minX, position.x))),
    y: Math.round(Math.min(maxY, Math.max(minY, position.y))),
  };
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** The position after an arrow key, clamped; null when the key isn't an arrow. */
export function nudgePanelPosition(position: PanelPosition, key: string, shift: boolean, size: PanelSize, viewport: Viewport): PanelPosition | null {
  const direction = ARROWS[key];
  if (!direction) return null;
  const step = shift ? NUDGE_STEP_LARGE : NUDGE_STEP;
  return clampPanelPosition({ x: position.x + direction[0] * step, y: position.y + direction[1] * step }, size, viewport);
}

/** The position after dragging from `origin` (where the panel was when the drag began) by the pointer's movement. */
export function dragPanelPosition(
  origin: PanelPosition,
  pointerStart: { x: number; y: number },
  pointerNow: { x: number; y: number },
  size: PanelSize,
  viewport: Viewport,
): PanelPosition {
  return clampPanelPosition({ x: origin.x + pointerNow.x - pointerStart.x, y: origin.y + pointerNow.y - pointerStart.y }, size, viewport);
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Reads what was stored, tolerating anything (missing, corrupt, hand-edited): bad input gives the defaults. */
export function parseStoredPanel(raw: string | null | undefined): StoredPanel {
  const fallback: StoredPanel = { position: null, collapsed: false };
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return fallback;
    const { x, y, collapsed } = value as { x?: unknown; y?: unknown; collapsed?: unknown };
    return {
      position: finite(x) && finite(y) ? { x, y } : null,
      collapsed: collapsed === true,
    };
  } catch {
    return fallback;
  }
}

export function serializePanel(panel: StoredPanel): string {
  return JSON.stringify({ x: panel.position?.x ?? null, y: panel.position?.y ?? null, collapsed: panel.collapsed });
}
