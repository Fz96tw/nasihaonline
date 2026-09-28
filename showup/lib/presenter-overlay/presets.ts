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

export type AnnotationPresetFields = Partial<Pick<PresenterOverlaySettings, "gestures" | "arrowMode" | "penColor" | "voicePin">>;

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

// Every Look preset fully specifies `span` and `background` (even where its own look doesn't care about
// one of them) — these are the two fields whose stale leftover value from a *previous* Look preset is
// actually visible (span makes layoutGhosts ignore scale/position entirely; background swaps the whole
// cutout-vs-panel render path) — so switching between any two Look presets always lands in a fully
// coherent state instead of carrying over an invisible setting from whichever preset was applied before.
export const LOOK_PRESETS: Preset<LookPresetFields>[] = [
  { id: "pip", label: "Picture-in-Picture", fields: { scale: 0.3, background: "keep", panelShape: "rounded", opacity: 1, position: "right", span: false } },
  { id: "full-screen-reach", label: "Full-screen Reach", fields: { span: true, opacity: 0.45, background: "remove" } },
  { id: "talking-head", label: "Talking Head", fields: { scale: 1, position: "center", background: "remove", opacity: 1, span: false } },
  { id: "minimal-corner", label: "Minimal Corner", fields: { scale: 0.3, opacity: 0.35, background: "remove", position: "left", span: false } },
];

export const TRUST_PRESETS: Preset<TrustPresetFields>[] = [
  { id: "locked-webinar", label: "Locked Webinar", fields: { policy: "off", pointerPolicy: "off", drawPolicy: "off", followSpeaker: false, pinnedId: "self" } },
  { id: "open-floor", label: "Open Floor", fields: { policy: "ask", pointerPolicy: "on", drawPolicy: "ask" } },
  { id: "qa-only", label: "Q&A Only", fields: { policy: "ask", pointerPolicy: "on", drawPolicy: "off" } },
];

// Voice Pin (dictate a label at the pointer, Showup's V-sign gesture) rides along with Whiteboard Mode rather
// than getting its own button: "Pointer Only" used to be the third button here, but its fields were a strict,
// permanent subset of Whiteboard Mode's, so it was always shown "active" the moment Whiteboard was — a
// redundant button, removed rather than replaced. A host who wants pointing without drawing tools, or drawing
// tools without Voice Pin, reaches for the Fine-tune tab's individual toggles instead of a third preset.
export const ANNOTATION_PRESETS: Preset<AnnotationPresetFields>[] = [
  { id: "annotation-off", label: "Off", fields: { gestures: false } },
  { id: "whiteboard", label: "Whiteboard Mode", fields: { gestures: true, arrowMode: false, penColor: "red", voicePin: true } },
];
