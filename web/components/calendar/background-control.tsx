"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageOff, ImagePlus, Sparkles, Trash2, Upload } from "lucide-react";
import { LocalVideoTrack, RoomEvent, Track, type Room } from "livekit-client";
import { useRoomContext } from "@livekit/components-react";
import { LK_PANEL_CLASS } from "@/components/calendar/livekit-control-styles";
import {
  BACKGROUND_CHOICE_STORAGE_KEY,
  CUSTOM_BACKGROUND_MAX_EDGE,
  CUSTOM_BACKGROUND_STORAGE_KEY,
  MEETING_BACKGROUND_PRESETS,
  NO_BACKGROUND,
  findPreset,
  fitWithin,
  parseBackgroundChoice,
  sameBackgroundChoice,
  serializeBackgroundChoice,
  validateCustomBackgroundFile,
  type MeetingBackgroundChoice,
} from "@/lib/meeting-backgrounds";

/**
 * Webcam background effects (blur / preset image / the participant's own
 * image) for anyone in the call, members and guests alike. Everything runs
 * in this browser via @livekit/track-processors: the processed camera video
 * is what gets published, so other participants and room-composite
 * recordings see the effect with no server work. A custom image is decoded,
 * downscaled and kept here (localStorage) — never uploaded.
 *
 * The track-processors JS is a lazy chunk (needed up front only for the
 * browser-support check); its MediaPipe wasm + segmentation model — fetched
 * from the same jsdelivr/googleapis CDNs the presenter overlay already uses —
 * only download once someone actually turns an effect on. Off by default.
 *
 * A processor survives camera off/on (livekit-client restarts it on the new
 * capture), so the only times we (re)attach one are: the choice changes, or
 * a camera track appears/unmutes without one (first publish, re-publish).
 * We never attach to a muted camera — its capture is stopped.
 */

type TrackProcessorsModule = typeof import("@livekit/track-processors");
let trackProcessorsPromise: Promise<TrackProcessorsModule> | null = null;
function loadTrackProcessors(): Promise<TrackProcessorsModule> {
  trackProcessorsPromise ??= import("@livekit/track-processors").catch((error) => {
    trackProcessorsPromise = null;
    throw error;
  });
  return trackProcessorsPromise;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the browser refused (private mode, quota) — the caller still uses the value for this session. */
function writeStorage(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Decodes the picked file and re-encodes it as a ≤1280px JPEG data URL, entirely in the browser. */
async function downscaleImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, CUSTOM_BACKGROUND_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}

function getCameraTrack(room: Room): LocalVideoTrack | null {
  const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
  return track instanceof LocalVideoTrack ? track : null;
}

type ProcessorOptions =
  | { mode: "disabled" }
  | { mode: "background-blur"; blurRadius: number }
  | { mode: "virtual-background"; imagePath: string };

function processorOptionsFor(choice: MeetingBackgroundChoice, customImage: string | null): ProcessorOptions | null {
  switch (choice.kind) {
    case "none":
      return null;
    case "blur":
      return { mode: "background-blur", blurRadius: 12 };
    case "preset": {
      const preset = findPreset(choice.id);
      return preset ? { mode: "virtual-background", imagePath: preset.src } : null;
    }
    case "custom":
      return customImage ? { mode: "virtual-background", imagePath: customImage } : null;
  }
}

export function BackgroundControl({ onError }: { onError: (message: string) => void }) {
  const room = useRoomContext();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<MeetingBackgroundChoice>(NO_BACKGROUND);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // What should be on the camera right now; read by the room-event sync below.
  const desiredRef = useRef<{ choice: MeetingBackgroundChoice; customImage: string | null }>({
    choice: NO_BACKGROUND,
    customImage: null,
  });
  // Serializes processor changes — setProcessor/switchTo/stopProcessor must not interleave on one track.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(task, task);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  /** Makes the camera track match desiredRef. Throws if the effect couldn't be applied (the processor is removed first). */
  const applyToCamera = useCallback(async () => {
    const track = getCameraTrack(room);
    const options = processorOptionsFor(desiredRef.current.choice, desiredRef.current.customImage);
    if (!track) return;
    const current = track.getProcessor();
    if (!options) {
      if (current) await track.stopProcessor();
      return;
    }
    if (track.isMuted) return; // capture is stopped; picked up again on unmute
    const { BackgroundProcessor, BackgroundProcessorWrapper } = await loadTrackProcessors();
    try {
      if (current instanceof BackgroundProcessorWrapper) {
        await current.switchTo(options);
      } else {
        await track.setProcessor(BackgroundProcessor(options));
      }
    } catch (error) {
      // Leave the plain camera publishing rather than a half-initialized pipeline.
      if (track.getProcessor()) await track.stopProcessor().catch(() => undefined);
      throw error;
    }
  }, [room]);

  const failToNone = useCallback((error: unknown) => {
    console.error("[background] failed to apply background effect", error);
    desiredRef.current = { ...desiredRef.current, choice: NO_BACKGROUND };
    setChoice(NO_BACKGROUND);
    writeStorage(BACKGROUND_CHOICE_STORAGE_KEY, serializeBackgroundChoice(NO_BACKGROUND));
    onErrorRef.current("Couldn't turn on the background effect. Your camera is still on without it.");
  }, []);

  // Restore this browser's saved choice once, and detect support (client-only APIs).
  useEffect(() => {
    let isSupported = false;
    void loadTrackProcessors()
      .then((mod) => {
        isSupported = mod.supportsBackgroundProcessors();
      })
      .catch(() => {
        isSupported = false;
      })
      .finally(() => {
        setSupported(isSupported);
        if (!isSupported) return;
        const storedImage = readStorage(CUSTOM_BACKGROUND_STORAGE_KEY);
        const stored = parseBackgroundChoice(readStorage(BACKGROUND_CHOICE_STORAGE_KEY), !!storedImage);
        desiredRef.current = { choice: stored, customImage: storedImage };
        setCustomImage(storedImage);
        setChoice(stored);
        if (stored.kind !== "none") void enqueue(applyToCamera).catch(failToNone);
      });
  }, [applyToCamera, enqueue, failToNone]);

  // Re-attach when a camera track appears or comes back without a processor (first publish, re-publish, unmute).
  useEffect(() => {
    function sync() {
      if (desiredRef.current.choice.kind === "none") return;
      const track = getCameraTrack(room);
      if (!track || track.isMuted || track.getProcessor()) return;
      void enqueue(applyToCamera).catch(failToNone);
    }
    room.on(RoomEvent.LocalTrackPublished, sync);
    room.on(RoomEvent.TrackUnmuted, sync);
    return () => {
      room.off(RoomEvent.LocalTrackPublished, sync);
      room.off(RoomEvent.TrackUnmuted, sync);
    };
  }, [room, applyToCamera, enqueue, failToNone]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  async function select(next: MeetingBackgroundChoice, nextCustomImage: string | null = customImage) {
    setPanelError(null);
    const previous = desiredRef.current;
    desiredRef.current = { choice: next, customImage: nextCustomImage };
    setChoice(next);
    setBusy(true);
    try {
      await enqueue(applyToCamera);
      writeStorage(BACKGROUND_CHOICE_STORAGE_KEY, serializeBackgroundChoice(next));
    } catch (error) {
      console.error("[background] failed to apply background effect", error);
      // switchTo failing leaves no processor (see applyToCamera), so the camera is plain now.
      desiredRef.current = { ...previous, choice: NO_BACKGROUND };
      setChoice(NO_BACKGROUND);
      writeStorage(BACKGROUND_CHOICE_STORAGE_KEY, serializeBackgroundChoice(NO_BACKGROUND));
      setPanelError("Couldn't turn on that background. Your camera is still on without it.");
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(file: File | undefined) {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setPanelError(null);
    const problem = validateCustomBackgroundFile(file);
    if (problem) {
      setPanelError(problem);
      return;
    }
    let dataUrl: string;
    try {
      setBusy(true);
      dataUrl = await downscaleImage(file);
    } catch (error) {
      console.error("[background] couldn't read the picked image", error);
      setPanelError("We couldn't read that image. Please try a different file.");
      setBusy(false);
      return;
    }
    setCustomImage(dataUrl);
    await select({ kind: "custom" }, dataUrl);
    if (desiredRef.current.choice.kind === "custom" && !writeStorage(CUSTOM_BACKGROUND_STORAGE_KEY, dataUrl)) {
      onError("Your image is on for this meeting, but this browser couldn't save it for next time.");
    }
  }

  async function removeCustomImage() {
    writeStorage(CUSTOM_BACKGROUND_STORAGE_KEY, null);
    setCustomImage(null);
    if (choice.kind === "custom") await select(NO_BACKGROUND, null);
    else desiredRef.current = { ...desiredRef.current, customImage: null };
  }

  if (supported === null) return null;

  const isActive = choice.kind !== "none";
  const tileClass = (selected: boolean) =>
    `relative flex h-[54px] w-24 items-center justify-center overflow-hidden rounded-md border text-xs disabled:opacity-50 ${
      selected ? "border-sky-400 ring-2 ring-sky-400" : "border-white/15 hover:border-white/40"
    }`;

  return (
    <div ref={rootRef} className="relative">
      {open && supported && (
        <div
          role="dialog"
          aria-label="Background"
          // Same placement as the Reactions tray: anchored above the button, pinned to the viewport on small screens.
          className={`absolute bottom-full right-0 z-10 mb-2 w-max max-w-[calc(100vw-1rem)] rounded-lg border p-3 shadow-lg max-sm:fixed max-sm:inset-x-0 max-sm:bottom-[calc(69px+0.5rem)] max-sm:mx-auto max-sm:mb-0 ${LK_PANEL_CLASS}`}
        >
          <p className="mb-2 text-sm font-medium">Background</p>
          <div className="grid grid-cols-3 gap-2" aria-busy={busy}>
            <button
              type="button"
              disabled={busy}
              aria-pressed={choice.kind === "none"}
              className={tileClass(choice.kind === "none")}
              onClick={() => void select(NO_BACKGROUND)}
            >
              <span className="flex flex-col items-center gap-1">
                <ImageOff className="h-4 w-4" />
                None
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={choice.kind === "blur"}
              className={`${tileClass(choice.kind === "blur")} bg-gradient-to-br from-white/20 to-white/5`}
              onClick={() => void select({ kind: "blur" })}
            >
              <span className="flex flex-col items-center gap-1">
                <Sparkles className="h-4 w-4" />
                Blur
              </span>
            </button>
            {MEETING_BACKGROUND_PRESETS.map((preset) => {
              const selected = sameBackgroundChoice(choice, { kind: "preset", id: preset.id });
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={busy}
                  aria-pressed={selected}
                  aria-label={preset.label}
                  title={preset.label}
                  className={tileClass(selected)}
                  onClick={() => void select({ kind: "preset", id: preset.id })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny static thumbnail inside the dark LiveKit tray */}
                  <img src={preset.thumb} alt="" className="h-full w-full object-cover" />
                </button>
              );
            })}
            {customImage && (
              <button
                type="button"
                disabled={busy}
                aria-pressed={choice.kind === "custom"}
                aria-label="Your image"
                title="Your image"
                className={tileClass(choice.kind === "custom")}
                onClick={() => void select({ kind: "custom" })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, never uploaded */}
                <img src={customImage} alt="" className="h-full w-full object-cover" />
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
            >
              {customImage ? <Upload className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {customImage ? "Replace your image" : "Use your own image"}
            </button>
            {customImage && (
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
                onClick={() => void removeCustomImage()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => void onFilePicked(event.target.files?.[0])}
            />
          </div>
          <p className="mt-2 max-w-[18rem] text-[11px] leading-snug text-white/60">
            Your image stays on this device. Others in the call (and any recording) see it behind you.
          </p>
          {panelError && (
            <p role="alert" className="mt-2 max-w-[18rem] text-xs text-red-300">
              {panelError}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="lk-button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Background"
        aria-pressed={isActive}
        disabled={!supported}
        title={supported ? "Background" : "Background effects aren't supported in this browser."}
        onClick={() => {
          setPanelError(null);
          setOpen((v) => !v);
        }}
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Background</span>
      </button>
    </div>
  );
}
