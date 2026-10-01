"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_RECORDING_QUALITY,
  RECORDING_QUALITIES,
  RECORDING_QUALITY_IDS,
  loadRecordingQuality,
  parseRecordingQuality,
  saveRecordingQuality,
  type RecordingQualityId,
} from "@/lib/recording-quality";

const CHANGED_EVENT = "showup:recording-quality-changed";

/** The remembered preset, kept in step between every place that shows it (this picker, the Record chevron). */
export function useRecordingQuality(): [RecordingQualityId, (id: RecordingQualityId) => void] {
  const [quality, setQuality] = useState<RecordingQualityId>(DEFAULT_RECORDING_QUALITY);
  useEffect(() => {
    setQuality(loadRecordingQuality());
    const sync = () => setQuality(loadRecordingQuality());
    window.addEventListener(CHANGED_EVENT, sync);
    return () => window.removeEventListener(CHANGED_EVENT, sync);
  }, []);
  function change(id: RecordingQualityId) {
    saveRecordingQuality(id);
    setQuality(id);
    window.dispatchEvent(new Event(CHANGED_EVENT));
  }
  return [quality, change];
}

/**
 * Host-only. Picks the preset the next "Start recording" uses (read at click time in recording-controls). Encoding is
 * fixed once a recording starts, so changing this mid-recording takes effect at the next stop and start, which begins a
 * new part of the same recording.
 */
export function RecordingQualityPicker() {
  const [quality, setQuality] = useRecordingQuality();

  return (
    <div className="flex flex-col gap-1" data-testid="recording-quality">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Recording quality</span>
      <label className="flex flex-col gap-1 text-xs text-white/70">
        Applies the next time you start recording
        <select
          className="rounded border border-white/20 bg-black/40 px-1 py-0.5 text-xs text-white"
          value={quality}
          onChange={(e) => {
            setQuality(parseRecordingQuality(e.target.value));
          }}
        >
          {RECORDING_QUALITY_IDS.map((id) => (
            <option key={id} value={id}>
              {RECORDING_QUALITIES[id].label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-white/50">{RECORDING_QUALITIES[quality].hint}</p>
      <p className="text-[11px] text-white/50">Can&apos;t change mid-recording: stop and start to begin a new part at the new setting.</p>
    </div>
  );
}
