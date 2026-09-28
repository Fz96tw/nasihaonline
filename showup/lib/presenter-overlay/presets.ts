import type { PresenterOverlaySettings } from "./compositor.ts";
import type { JoinPolicy } from "./co-ghosts.ts";
import type { PointerPolicy } from "./guest-pointer.ts";

export type LookPresetFields = Partial<
  Pick<PresenterOverlaySettings, "scale" | "background" | "panelShape" | "opacity" | "position" | "span">
>;

/** `pinnedId: "self"` stands in for the host's own id, which is private to the component. */
export type TrustPresetFields = Partial<{
  policy: JoinPolicy;
  pointerPolicy: PointerPolicy;
  drawPolicy: PointerPolicy;
  followSpeaker: boolean;
  pinnedId: "self" | null;
}>;

export type AnnotationPresetFields = Partial<Pick<PresenterOverlaySettings, "gestures" | "arrowMode" | "penColor">>;

export type Preset<F> = { id: string; label: string; fields: F };

/**
 * True when every field `fields` defines matches `current`'s value for that field.
 * Fields `fields` omits are ignored — this is what makes a preset a scoped, partial
 * apply instead of a full reset, and what lets "is this preset active" be computed
 * fresh from live state instead of tracked separately.
 */
export function presetMatches<F extends Record<string, unknown>>(fields: F, current: Partial<F>): boolean {
  return (Object.keys(fields) as (keyof F)[]).every((key) => current[key] === fields[key]);
}

export const LOOK_PRESETS: Preset<LookPresetFields>[] = [
  { id: "pip", label: "Picture-in-Picture", fields: { scale: 0.3, background: "keep", panelShape: "rounded", opacity: 1, position: "right" } },
  { id: "full-screen-reach", label: "Full-screen Reach", fields: { span: true, opacity: 0.45 } },
  { id: "talking-head", label: "Talking Head", fields: { scale: 1, position: "center", background: "remove", opacity: 1, span: false } },
  { id: "minimal-corner", label: "Minimal Corner", fields: { scale: 0.3, opacity: 0.35, background: "remove", position: "left" } },
];

export const TRUST_PRESETS: Preset<TrustPresetFields>[] = [
  { id: "locked-webinar", label: "Locked Webinar", fields: { policy: "off", pointerPolicy: "off", drawPolicy: "off", followSpeaker: false, pinnedId: "self" } },
  { id: "open-floor", label: "Open Floor", fields: { policy: "ask", pointerPolicy: "on", drawPolicy: "ask" } },
  { id: "qa-only", label: "Q&A Only", fields: { policy: "ask", pointerPolicy: "on", drawPolicy: "off" } },
];

export const ANNOTATION_PRESETS: Preset<AnnotationPresetFields>[] = [
  { id: "annotation-off", label: "Off", fields: { gestures: false } },
  { id: "whiteboard", label: "Whiteboard Mode", fields: { gestures: true, arrowMode: false, penColor: "red" } },
  { id: "pointer-only", label: "Pointer Only", fields: { gestures: true } },
];
