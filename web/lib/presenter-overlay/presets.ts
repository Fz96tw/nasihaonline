import type { PresenterOverlaySettings } from "./compositor.ts";
import type { JoinPolicy } from "./co-ghosts.ts";

export type LookPresetFields = Partial<Pick<PresenterOverlaySettings, "scale" | "opacity" | "position" | "span" | "background" | "panelShape">>;

/** `pinnedId: "self"` stands in for the host's own id, which is private to the component. */
export type TrustPresetFields = Partial<{
  policy: JoinPolicy;
  followSpeaker: boolean;
  pinnedId: "self" | null;
}>;

export type AnnotationPresetFields = Partial<Pick<PresenterOverlaySettings, "gestures" | "penColor">>;

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
// scale/position) — they're the fields whose stale leftover value from a *previous* Look preset is actually
// visible (span makes the cut-out fill the frame, ignoring scale/position entirely; background swaps a
// cut-out for a real-background panel) — so switching between any two Look presets always lands in a fully
// coherent state instead of carrying over an invisible setting from whichever preset was applied before.
// Picture-in-Picture is the one preset that keeps the background (a small corner bubble reads as a real PiP
// tile, not a ghost); the rest cut the person out, same as showup's equivalent presets.
export const LOOK_PRESETS: Preset<LookPresetFields>[] = [
  { id: "pip", label: "Picture-in-Picture", fields: { scale: 0.3, background: "keep", panelShape: "rounded", opacity: 1, position: "right", span: false } },
  { id: "full-screen-reach", label: "Full-screen Reach", fields: { span: true, opacity: 0.45, background: "remove" } },
  { id: "talking-head", label: "Talking Head", fields: { scale: 1, position: "center", background: "remove", opacity: 1, span: false } },
  { id: "minimal-corner", label: "Minimal Corner", fields: { scale: 0.3, opacity: 0.35, background: "remove", position: "left", span: false } },
];

// showup also has "Open Floor" and "Q&A Only" here, differentiated by guest pointer/draw permissions — this
// overlay has no guest pointer/draw feature, so those two would collapse to an identical {policy: "ask"} and
// show as two indistinguishable active buttons. Only "Locked Webinar" survives the port: it stays meaningful
// without pointer/draw (join policy off, follow-speaker off, pinned to the host).
export const TRUST_PRESETS: Preset<TrustPresetFields>[] = [
  { id: "locked-webinar", label: "Locked Webinar", fields: { policy: "off", followSpeaker: false, pinnedId: "self" } },
];

export const ANNOTATION_PRESETS: Preset<AnnotationPresetFields>[] = [
  { id: "annotation-off", label: "Off", fields: { gestures: false } },
  { id: "whiteboard", label: "Whiteboard Mode", fields: { gestures: true, penColor: "red" } },
  { id: "pointer-only", label: "Pointer Only", fields: { gestures: true } },
];
