/**
 * Pure helpers for the host's "Share quality" experiment controls (Fine-tune tab): overriding what LiveKit put on the
 * screen-share RTCRtpSender, and turning getStats() output into a readable summary. No browser objects are touched here.
 */

export type QualityOverrides = {
  /** Cap in bits per second for the highest layer; null leaves LiveKit's own value. */
  maxBitrate: number | null;
  /** Cap in frames per second; null leaves LiveKit's own value. */
  maxFramerate: number | null;
  /** false turns the reduced-resolution simulcast layers off, so viewers only ever get the full-resolution one. */
  lowLayers: boolean;
};

export const DEFAULT_OVERRIDES: QualityOverrides = { maxBitrate: null, maxFramerate: null, lowLayers: true };

type EncodingLike = {
  rid?: string;
  active?: boolean;
  maxBitrate?: number;
  maxFramerate?: number;
  scaleResolutionDownBy?: number;
};

/** The full-resolution encoding is the one scaled down least (an unset scale counts as 1). */
export function topEncodingIndex(encodings: EncodingLike[]): number {
  let best = 0;
  encodings.forEach((encoding, index) => {
    if ((encoding.scaleResolutionDownBy ?? 1) < (encodings[best].scaleResolutionDownBy ?? 1)) best = index;
  });
  return best;
}

/**
 * Returns new encodings with the overrides applied. `original` is what LiveKit set (captured once), so choosing
 * "Auto" again restores it instead of keeping the last override. Lower layers keep their share of the bitrate.
 */
export function applyOverrides<T extends EncodingLike>(current: T[], original: T[], overrides: QualityOverrides): T[] {
  if (current.length === 0) return current;
  const top = topEncodingIndex(current);
  return current.map((encoding, index) => {
    const base = original[index] ?? encoding;
    const next: T = { ...encoding };
    if (index === top) {
      next.active = true;
      setOrDelete(next, "maxBitrate", overrides.maxBitrate ?? base.maxBitrate);
    } else {
      next.active = overrides.lowLayers;
      const ratio = overrides.maxBitrate && original[top]?.maxBitrate && base.maxBitrate ? base.maxBitrate / original[top].maxBitrate! : null;
      setOrDelete(next, "maxBitrate", ratio ? Math.round(overrides.maxBitrate! * ratio) : base.maxBitrate);
    }
    setOrDelete(next, "maxFramerate", overrides.maxFramerate ?? base.maxFramerate);
    return next;
  });
}

function setOrDelete<T extends EncodingLike>(target: T, key: "maxBitrate" | "maxFramerate", value: number | undefined) {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

export type OutboundSample = {
  at: number;
  bytesSent: number;
  framesEncoded: number;
  frameWidth: number;
  frameHeight: number;
  qualityLimitationReason: string;
};

export type OutboundSummary = {
  width: number;
  height: number;
  fps: number;
  kbps: number;
  /** "none" | "cpu" | "bandwidth" | "other" as reported by the browser. */
  limitedBy: string;
};

/** Reads the busiest video outbound-rtp entry (the full-resolution layer sends the most) from a getStats() report. */
export function sampleOutbound(report: Record<string, unknown>[], at: number): OutboundSample | null {
  let best: OutboundSample | null = null;
  for (let i = 0; i < report.length; i++) {
    const stat = report[i];
    if (stat.type !== "outbound-rtp" || stat.kind !== "video") continue;
    const bytesSent = Number(stat.bytesSent ?? 0);
    if (!best || bytesSent > best.bytesSent) {
      best = {
        at,
        bytesSent,
        framesEncoded: Number(stat.framesEncoded ?? 0),
        frameWidth: Number(stat.frameWidth ?? 0),
        frameHeight: Number(stat.frameHeight ?? 0),
        qualityLimitationReason: String(stat.qualityLimitationReason ?? "none"),
      };
    }
  }
  return best;
}

export function summarize(previous: OutboundSample, current: OutboundSample): OutboundSummary | null {
  const seconds = (current.at - previous.at) / 1000;
  if (seconds <= 0) return null;
  return {
    width: current.frameWidth,
    height: current.frameHeight,
    fps: Math.max(0, (current.framesEncoded - previous.framesEncoded) / seconds),
    kbps: Math.max(0, ((current.bytesSent - previous.bytesSent) * 8) / seconds / 1000),
    limitedBy: current.qualityLimitationReason,
  };
}
