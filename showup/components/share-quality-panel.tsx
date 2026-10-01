"use client";

import { useEffect, useRef, useState } from "react";
import type { LocalVideoTrack } from "livekit-client";
import {
  DEFAULT_OVERRIDES,
  applyOverrides,
  sampleOutbound,
  summarize,
  type OutboundSample,
  type OutboundSummary,
  type QualityOverrides,
} from "@/lib/share-quality";

const labelClass = "flex flex-col gap-1 text-xs text-white/70";
const selectClass = "rounded border border-white/20 bg-black/40 px-1 py-0.5 text-xs text-white";

const BITRATES: [string, number | null][] = [["Auto", null], ["1 Mbps", 1_000_000], ["2.5 Mbps", 2_500_000], ["5 Mbps", 5_000_000], ["8 Mbps", 8_000_000]];
const FRAMERATES: [string, number | null][] = [["Auto", null], ["10 fps", 10], ["15 fps", 15], ["24 fps", 24], ["30 fps", 30]];
const HEIGHTS: [string, number][] = [["720p (default)", 720], ["1080p", 1080], ["1440p", 1440], ["Same as capture", 0]];
const HINTS = ["detail", "text", "motion", ""] as const;
const DEGRADATION: RTCDegradationPreference[] = ["maintain-resolution", "balanced", "maintain-framerate"];

/**
 * Host-only experiment controls for screen-share sharpness, applied live to the running share. Nothing here is sent to
 * guests; their browsers just receive whatever the sender now produces. LiveKit may reset layer settings when it
 * re-negotiates (for example a viewer joining), so the readout shows what is really being sent.
 */
export function ShareQualityPanel({
  track,
  overlayOn,
  outputMaxHeight,
  onOutputMaxHeight,
}: {
  track: LocalVideoTrack;
  overlayOn: boolean;
  outputMaxHeight: number;
  onOutputMaxHeight: (height: number) => void;
}) {
  const [overrides, setOverrides] = useState<QualityOverrides>(DEFAULT_OVERRIDES);
  const [hint, setHint] = useState<string>(() => track.mediaStreamTrack.contentHint);
  const [degradation, setDegradation] = useState<RTCDegradationPreference>("maintain-resolution");
  const [summary, setSummary] = useState<OutboundSummary | null>(null);
  const originalRef = useRef<RTCRtpEncodingParameters[] | null>(null);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  // The track under the sender changes when the overlay is turned on or off; re-read what it now says.
  useEffect(() => {
    setHint(track.mediaStreamTrack.contentHint);
  }, [track, overlayOn]);

  async function push(next: QualityOverrides) {
    const sender = track.sender;
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings?.length) return;
    // Remember LiveKit's own values the first time, so "Auto" can restore them.
    if (!originalRef.current) originalRef.current = params.encodings.map((encoding) => ({ ...encoding }));
    params.encodings = applyOverrides(params.encodings, originalRef.current, next);
    try {
      await sender.setParameters(params);
    } catch (error) {
      console.error("[share-quality] setParameters failed", error);
    }
  }

  function change(patch: Partial<QualityOverrides>) {
    const next = { ...overridesRef.current, ...patch };
    setOverrides(next);
    void push(next);
  }

  // Re-assert after the sender may have been re-negotiated, and read the real numbers once a second.
  useEffect(() => {
    let previous: OutboundSample | null = null;
    let tick = 0;
    const timer = setInterval(async () => {
      const sender = track.sender;
      if (!sender) return;
      tick += 1;
      if (tick % 5 === 0 && JSON.stringify(overridesRef.current) !== JSON.stringify(DEFAULT_OVERRIDES)) void push(overridesRef.current);
      try {
        const report = await sender.getStats();
        const rows: Record<string, unknown>[] = [];
        report.forEach((value) => rows.push(value));
        const sample = sampleOutbound(rows, performance.now());
        if (sample && previous) setSummary(summarize(previous, sample));
        previous = sample;
      } catch {
        // Stats are best effort.
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  return (
    <div className="flex flex-col gap-2" data-testid="share-quality">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Share quality (experiment)</span>

      <div className="rounded bg-black/30 px-2 py-1 font-mono text-[11px] text-white/80" data-testid="share-quality-readout">
        {summary
          ? `Sending ${summary.width}×${summary.height} · ${summary.fps.toFixed(0)} fps · ${(summary.kbps / 1000).toFixed(2)} Mbps · limited by ${summary.limitedBy}`
          : "Measuring…"}
      </div>

      <label className={`${labelClass} ${overlayOn ? "" : "opacity-40"}`} title={overlayOn ? undefined : "Only used while you're on the share (the plain share is sent at its captured size)"}>
        Camera-overlay output size
        <select
          className={selectClass}
          disabled={!overlayOn}
          value={outputMaxHeight}
          onChange={(e) => onOutputMaxHeight(Number(e.target.value))}
        >
          {HEIGHTS.map(([name, value]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Max bitrate
        <select className={selectClass} value={String(overrides.maxBitrate)} onChange={(e) => change({ maxBitrate: e.target.value === "null" ? null : Number(e.target.value) })}>
          {BITRATES.map(([name, value]) => (
            <option key={name} value={String(value)}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Max frame rate
        <select className={selectClass} value={String(overrides.maxFramerate)} onChange={(e) => change({ maxFramerate: e.target.value === "null" ? null : Number(e.target.value) })}>
          {FRAMERATES.map(([name, value]) => (
            <option key={name} value={String(value)}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={overrides.lowLayers} onChange={(e) => change({ lowLayers: e.target.checked })} />
        Also send a smaller copy (viewers on weak links get it)
      </label>

      <label className={labelClass}>
        Content type
        <select
          className={selectClass}
          value={hint}
          onChange={(e) => {
            setHint(e.target.value);
            track.mediaStreamTrack.contentHint = e.target.value;
          }}
        >
          {HINTS.map((value) => (
            <option key={value} value={value}>
              {value === "" ? "none (browser decides)" : value}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        When struggling, keep
        <select
          className={selectClass}
          value={degradation}
          onChange={(e) => {
            const value = e.target.value as RTCDegradationPreference;
            setDegradation(value);
            track.setDegradationPreference(value);
          }}
        >
          {DEGRADATION.map((value) => (
            <option key={value} value={value}>
              {value === "maintain-resolution" ? "resolution (sharp, choppy)" : value === "maintain-framerate" ? "frame rate (smooth, softer)" : "balanced"}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="self-start rounded border border-white/20 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10"
        onClick={() => {
          onOutputMaxHeight(720);
          setOverrides(DEFAULT_OVERRIDES);
          void push(DEFAULT_OVERRIDES);
          track.mediaStreamTrack.contentHint = "detail";
          setHint("detail");
          setDegradation("maintain-resolution");
          track.setDegradationPreference("maintain-resolution");
        }}
      >
        Reset share quality
      </button>
    </div>
  );
}
