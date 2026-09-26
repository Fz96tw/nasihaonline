/**
 * Presenter camera overlay (objective 961a9322): combines the presenter's
 * screen capture with a background-removed, semi-transparent cut-out of
 * their webcam (plus an optional caption and local image) into a single
 * video track, which the caller swaps into the presenter's already-published
 * ScreenShare track — so the existing VideoConference focus layout and the
 * "speaker" egress layout (lib/livekit-egress.ts) show it with no
 * server-side changes.
 *
 * Runs entirely in the presenter's browser; nothing here talks to our
 * server (the caption/image never leave the page except as pixels in the
 * published video).
 *
 * Frame pacing — the load-bearing design choice: the pipeline is driven by
 * the *webcam's* MediaStreamTrackProcessor frame stream, not
 * requestAnimationFrame or a timer. Chrome freezes rAF and throttles
 * timers to ~1Hz in a background tab, and the presenter's meeting tab is
 * almost always in the background while they're in their slides app. A
 * stream read loop is promise-driven by camera frame arrival, which
 * background throttling doesn't touch. It's the webcam and not the screen
 * that drives it because Chrome's screen capture only emits a frame when
 * the captured content changes — a static slide would otherwise freeze
 * the presenter's cut-out too. The screen stream just refreshes a cached
 * "latest screen" canvas.
 *
 * Chrome/Edge only: needs the (non-standard on window) insertable-streams
 * pair MediaStreamTrackProcessor + MediaStreamTrackGenerator — see
 * isPresenterOverlaySupported().
 */

import type { ImageSegmenter } from "@mediapipe/tasks-vision";

// Insertable-streams (Chrome's main-thread flavor) aren't in TS's DOM lib yet.
type MediaStreamTrackProcessorCtor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> };
type MediaStreamTrackGeneratorCtor = new (init: { kind: "video" }) => MediaStreamTrack & { writable: WritableStream<VideoFrame> };

function insertableStreams() {
  const w = globalThis as unknown as {
    MediaStreamTrackProcessor?: MediaStreamTrackProcessorCtor;
    MediaStreamTrackGenerator?: MediaStreamTrackGeneratorCtor;
  };
  return { Processor: w.MediaStreamTrackProcessor, Generator: w.MediaStreamTrackGenerator };
}

/** True on Chrome/Edge desktop; false on Firefox, Safari (incl. iOS), and anything without screen capture. */
export function isPresenterOverlaySupported(): boolean {
  if (typeof window === "undefined") return false;
  const { Processor, Generator } = insertableStreams();
  return Boolean(Processor && Generator && typeof navigator.mediaDevices?.getDisplayMedia === "function" && typeof OffscreenCanvas !== "undefined");
}

// Pinned to the installed package version so the JS glue and wasm always match.
const MEDIAPIPE_WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const SELFIE_SEGMENTER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

/** Output cap — matches the recording's EncodingOptions (1280×720 @ 20fps) in lib/livekit-egress.ts. */
const MAX_OUTPUT_WIDTH = 1280;
const MAX_OUTPUT_HEIGHT = 720;
const MIN_FRAME_INTERVAL_MS = 1000 / 20;
/** Each camera is segmented within this box (keeping its own aspect ratio) — plenty for a translucent cut-out, and keeps the per-frame mask readback cheap. */
const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 360;
/** The host's own camera drives the output frame rate and is segmented every output frame; everyone else is throttled. */
const GUEST_SEGMENT_INTERVAL_MS = 1000 / 12;
/** How long a ghost takes to fade in or out when the shown person changes. */
const CROSSFADE_MS = 300;

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type PresenterOverlaySettings = {
  /** 0–1, how solid the presenter's cut-out is drawn over the screen. */
  opacity: number;
  /** 0.3–1, cut-out height as a fraction of the output height. */
  scale: number;
  /** Horizontal anchor of the cut-out (always bottom-aligned, like someone standing in front of the slide). */
  position: "left" | "center" | "right";
  /**
   * Scale a lone ghost so the camera frame covers the whole shared frame (whichever edge needs the larger
   * scale), so the presenter can reach any part of a wide window. Ignores `scale` and `position`; the top
   * or sides of the frame may be cropped. Only applies to one ghost — a group keeps the normal layout.
   */
  span: boolean;
  /**
   * Flip the cut-out horizontally, like a mirror — on by default, because
   * the presenter aims by watching their own image over the slide: when it
   * moves the way a mirror would, reaching toward something on their screen
   * lands their image's hand on it (the weather-presenter setup). Viewers
   * see the hand on the same item, so pointing reads correctly for them
   * too; the only visible cost is reversed text on clothing.
   */
  mirror: boolean;
  caption: string;
  /**
   * With no typed caption, caption the ghost with the name of whoever is
   * shown — but only while someone else is in the meeting, so a lone host
   * doesn't get their own name stamped on the share.
   */
  autoCaption: boolean;
  image: ImageBitmap | null;
  imageCorner: OverlayCorner;
};

export const DEFAULT_PRESENTER_OVERLAY_SETTINGS: PresenterOverlaySettings = {
  opacity: 0.5,
  scale: 1,
  position: "center",
  span: false,
  mirror: true,
  caption: "",
  autoCaption: true,
  image: null,
  imageCorner: "top-right",
};

/** One camera that can be shown as a ghost. */
export type OverlaySource = {
  id: string;
  /** Shown as the auto caption. */
  label: string;
  track: MediaStreamTrack;
  /** Only the host's own camera is mirrored (see settings.mirror); everyone else is drawn as they are seen. */
  isLocal: boolean;
};

export type PresenterOverlayCompositor = {
  /** The combined track, ready for localParticipant.publishTrack(..., { source: ScreenShare }). */
  track: MediaStreamTrack;
  /** Mutated in place by the UI; read fresh on every frame, so changes apply without a restart. Applies to every ghost. */
  settings: PresenterOverlaySettings;
  /** Adds a camera (e.g. a guest joining). No-op if the id is already there. Not shown until it's in setVisible. */
  addSource: (source: OverlaySource) => void;
  removeSource: (id: string) => void;
  /** Which sources are shown, spaced out in this order (one ghost follows `position`); auto caption names them all. Others fade out over ~300 ms. */
  setVisible: (ids: string[]) => void;
  /** Stops all readers and the output track (the segmenter is kept for reuse). Does NOT stop the input tracks — the caller owns those. */
  stop: () => void;
};

let segmenterPromise: Promise<ImageSegmenter> | null = null;

/** Lazily loads MediaPipe (≈ a few MB of wasm + model) the first time someone presents; reused for later sessions on the same page. */
function loadSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SELFIE_SEGMENTER_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })().catch((error) => {
      segmenterPromise = null; // allow a retry on the next attempt
      throw error;
    });
  }
  return segmenterPromise;
}

function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable in this browser.");
  return ctx;
}

function fitWithin(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(1, MAX_OUTPUT_WIDTH / width, MAX_OUTPUT_HEIGHT / height);
  // Encoders want even dimensions.
  return { width: Math.max(2, Math.round((width * ratio) / 2) * 2), height: Math.max(2, Math.round((height * ratio) / 2) * 2) };
}

/** Fits a frame into the segmentation box without changing its aspect ratio (so a portrait phone camera stays portrait). */
export function fitBox(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(CAMERA_WIDTH / width, CAMERA_HEIGHT / height);
  return { width: Math.max(2, Math.round(width * ratio)), height: Math.max(2, Math.round(height * ratio)) };
}

/** Where one ghost is drawn on the output frame. */
export type GhostBox = { x: number; width: number; height: number };

/** With several ghosts each is drawn a little smaller, so they read as a group rather than a pile. */
const GROUP_SCALE = [1, 1, 0.85, 0.7];

/**
 * Lays ghosts out bottom-aligned. One ghost follows the `position` setting;
 * two or three are spaced evenly across the width in the order given (the
 * order they were added), each centred in its own slot. With `span`, a lone
 * ghost instead covers the whole frame. Pure, for testing.
 */
export function layoutGhosts(
  aspects: number[],
  outputWidth: number,
  outputHeight: number,
  scale: number,
  position: PresenterOverlaySettings["position"],
  span = false,
): GhostBox[] {
  const count = aspects.length;
  if (count === 1 && span) {
    // Cover fit, bottom-aligned and centred: the camera frame's edges land on (or past) the share's edges.
    const height = Math.max(outputHeight, outputWidth / aspects[0]);
    const width = height * aspects[0];
    return [{ x: (outputWidth - width) / 2, width, height }];
  }
  const height = outputHeight * scale * (GROUP_SCALE[Math.min(count, GROUP_SCALE.length - 1)] ?? 1);
  return aspects.map((aspect, index) => {
    const width = height * aspect;
    if (count === 1) {
      const x = position === "left" ? 0 : position === "right" ? outputWidth - width : (outputWidth - width) / 2;
      return { x, width, height };
    }
    const centre = (outputWidth * (index + 0.5)) / count;
    const x = width >= outputWidth ? (outputWidth - width) / 2 : Math.min(Math.max(centre - width / 2, 0), outputWidth - width);
    return { x, width, height };
  });
}

/** Everything one camera needs: its reader, its own cut-out canvas and its own fade state. */
type Source = {
  id: string;
  label: string;
  isLocal: boolean;
  reader: ReadableStreamDefaultReader<VideoFrame>;
  cameraCanvas: OffscreenCanvas;
  cameraCtx: OffscreenCanvasRenderingContext2D;
  maskCanvas: OffscreenCanvas;
  maskCtx: OffscreenCanvasRenderingContext2D;
  maskImage: ImageData;
  cutoutCanvas: OffscreenCanvas;
  cutoutCtx: OffscreenCanvasRenderingContext2D;
  /** Width / height of the cut-out, from the camera's real frame size. */
  aspect: number;
  hasCutout: boolean;
  /** 0–1 current fade, moving toward `target` (1 shown, 0 hidden). */
  alpha: number;
  target: number;
  lastSegmentAt: number;
  /** Where it was last laid out; a ghost fading out keeps drawing here. */
  box: GhostBox | null;
};

export async function startPresenterOverlayCompositor({
  screenTrack,
  cameraTrack,
  cameraLabel = "",
  onError,
}: {
  screenTrack: MediaStreamTrack;
  /** The host's own camera. Its frames drive the output, so it must stay live for as long as the overlay does. */
  cameraTrack: MediaStreamTrack;
  cameraLabel?: string;
  onError: (error: unknown) => void;
}): Promise<PresenterOverlayCompositor> {
  const { Processor, Generator } = insertableStreams();
  if (!Processor || !Generator) throw new Error("This browser can't combine video tracks. Try Chrome or Edge.");

  const segmenter = await loadSegmenter();

  const settings: PresenterOverlaySettings = { ...DEFAULT_PRESENTER_OVERLAY_SETTINGS };
  const generator = new Generator({ kind: "video" });
  const writer = generator.writable.getWriter();

  // Latest screen image, refreshed only when the screen actually changes.
  const screenCanvas = new OffscreenCanvas(2, 2);
  const screenCtx = context2d(screenCanvas);
  let hasScreenFrame = false;

  const outputCanvas = new OffscreenCanvas(MAX_OUTPUT_WIDTH, MAX_OUTPUT_HEIGHT);
  const outputCtx = context2d(outputCanvas);

  let stopped = false;
  let lastOutputAt = 0;
  let lastFadeAt = 0;
  let lastSegmentTimestamp = 0;
  let visibleIds: string[] = [];
  const sources = new Map<string, Source>();
  const LOCAL_ID = "local";

  const screenReader = new Processor({ track: screenTrack }).readable.getReader();

  async function pumpScreen() {
    while (!stopped) {
      const { value: frame, done } = await screenReader.read();
      if (done || !frame) return;
      try {
        const size = fitWithin(frame.displayWidth, frame.displayHeight);
        if (screenCanvas.width !== size.width || screenCanvas.height !== size.height) {
          screenCanvas.width = size.width;
          screenCanvas.height = size.height;
        }
        screenCtx.drawImage(frame, 0, 0, size.width, size.height);
        hasScreenFrame = true;
      } finally {
        frame.close();
      }
    }
  }

  function createSource(id: string, label: string, isLocal: boolean, track: MediaStreamTrack): Source {
    const cameraCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
    const maskCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
    const cutoutCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
    return {
      id,
      label,
      isLocal,
      reader: new Processor!({ track }).readable.getReader(),
      cameraCanvas,
      cameraCtx: context2d(cameraCanvas),
      maskCanvas,
      maskCtx: context2d(maskCanvas),
      maskImage: new ImageData(CAMERA_WIDTH, CAMERA_HEIGHT),
      cutoutCanvas,
      cutoutCtx: context2d(cutoutCanvas),
      aspect: CAMERA_WIDTH / CAMERA_HEIGHT,
      hasCutout: false,
      alpha: 0,
      target: visibleIds.includes(id) ? 1 : 0,
      lastSegmentAt: 0,
      box: null,
    };
  }

  /** True while a source is (or is still fading) on screen — only those cost segmentation time. */
  function isNeeded(source: Source): boolean {
    return source.target > 0 || source.alpha > 0.003;
  }

  /** Draws the camera frame at its real aspect ratio into the source's canvas, resizing every buffer to match. */
  function drawCamera(source: Source, frame: VideoFrame) {
    const size = fitBox(frame.displayWidth, frame.displayHeight);
    if (source.cameraCanvas.width !== size.width || source.cameraCanvas.height !== size.height) {
      for (const canvas of [source.cameraCanvas, source.maskCanvas, source.cutoutCanvas]) {
        canvas.width = size.width;
        canvas.height = size.height;
      }
      source.maskImage = new ImageData(size.width, size.height);
      source.aspect = size.width / size.height;
    }
    source.cameraCtx.drawImage(frame, 0, 0, size.width, size.height);
  }

  function updateCutout(source: Source) {
    // MediaPipe requires strictly increasing timestamps within a VIDEO-mode session; all sources share it.
    const timestamp = Math.max(performance.now(), lastSegmentTimestamp + 1);
    lastSegmentTimestamp = timestamp;
    segmenter.segmentForVideo(source.cameraCanvas, timestamp, (result) => {
      const masks = result.confidenceMasks;
      if (!masks || masks.length === 0) return;
      // selfie_segmenter has a single "person" confidence channel; a
      // multiclass model puts background in channel 0 instead.
      const single = masks.length === 1;
      const mask = masks[0];
      // Masks normally come back at the input size; resize our buffers if a model ever differs.
      if (mask.width !== source.maskImage.width || mask.height !== source.maskImage.height) {
        source.maskImage = new ImageData(mask.width, mask.height);
        source.maskCanvas.width = mask.width;
        source.maskCanvas.height = mask.height;
      }
      const confidence = mask.getAsFloat32Array();
      const data = source.maskImage.data;
      for (let i = 0; i < confidence.length; i++) {
        const person = single ? confidence[i] : 1 - confidence[i];
        data[i * 4 + 3] = person * 255;
      }
    });
    source.maskCtx.putImageData(source.maskImage, 0, 0);

    const { cutoutCtx, cameraCanvas, maskCanvas } = source;
    cutoutCtx.globalCompositeOperation = "copy";
    cutoutCtx.drawImage(cameraCanvas, 0, 0);
    cutoutCtx.globalCompositeOperation = "destination-in";
    // Soften the mask edge so the outline doesn't shimmer frame to frame.
    cutoutCtx.filter = "blur(2px)";
    cutoutCtx.drawImage(maskCanvas, 0, 0, cameraCanvas.width, cameraCanvas.height);
    cutoutCtx.filter = "none";
    cutoutCtx.globalCompositeOperation = "source-over";
    source.hasCutout = true;
  }

  /** Handles one camera frame for a source; always closes it. Returns true if a fresh cut-out was made. */
  function processFrame(source: Source, frame: VideoFrame, now: number, minIntervalMs: number): boolean {
    try {
      if (!isNeeded(source) || now - source.lastSegmentAt < minIntervalMs) return false;
      source.lastSegmentAt = now;
      drawCamera(source, frame);
      frame.close();
      updateCutout(source);
      return true;
    } finally {
      // Safe to call on an already-closed frame.
      frame.close();
    }
  }

  function drawCaption(width: number, height: number, caption: string) {
    const fontSize = Math.round(height * 0.05);
    outputCtx.font = `600 ${fontSize}px system-ui, sans-serif`;
    outputCtx.textAlign = "center";
    outputCtx.textBaseline = "middle";
    const padding = fontSize * 0.5;
    const maxTextWidth = width * 0.9;
    const textWidth = Math.min(outputCtx.measureText(caption).width, maxTextWidth);
    const boxHeight = fontSize + padding * 2;
    const boxY = height - boxHeight - height * 0.04;
    outputCtx.fillStyle = "rgba(0, 0, 0, 0.65)";
    outputCtx.fillRect((width - textWidth) / 2 - padding, boxY, textWidth + padding * 2, boxHeight);
    outputCtx.fillStyle = "#fff";
    outputCtx.fillText(caption, width / 2, boxY + boxHeight / 2, maxTextWidth);
  }

  function drawImageOverlay(width: number, height: number, image: ImageBitmap, corner: OverlayCorner) {
    const maxWidth = width * 0.25;
    const maxHeight = height * 0.3;
    const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const w = image.width * ratio;
    const h = image.height * ratio;
    const margin = Math.round(height * 0.03);
    const x = corner.endsWith("left") ? margin : width - w - margin;
    const y = corner.startsWith("top") ? margin : height - h - margin;
    outputCtx.drawImage(image, x, y, w, h);
  }

  /** Moves every source's fade toward its target, so a change of speaker crossfades over ~300 ms. */
  function stepFades(now: number) {
    const dt = lastFadeAt === 0 ? 0 : now - lastFadeAt;
    lastFadeAt = now;
    const step = dt / CROSSFADE_MS;
    for (const source of Array.from(sources.values())) {
      if (source.alpha < source.target) source.alpha = Math.min(source.target, source.alpha + step);
      else if (source.alpha > source.target) source.alpha = Math.max(source.target, source.alpha - step);
    }
  }

  function drawGhost(source: Source, box: GhostBox, height: number) {
    outputCtx.globalAlpha = settings.opacity * source.alpha;
    const y = height - box.height;
    // Bottom-aligned; only the host's own camera is mirrored (see settings.mirror).
    if (settings.mirror && source.isLocal) {
      outputCtx.save();
      outputCtx.translate(box.x + box.width, 0);
      outputCtx.scale(-1, 1);
      outputCtx.drawImage(source.cutoutCanvas, 0, y, box.width, box.height);
      outputCtx.restore();
    } else {
      outputCtx.drawImage(source.cutoutCanvas, box.x, y, box.width, box.height);
    }
    outputCtx.globalAlpha = 1;
  }

  function compose(timestamp: number) {
    const { width, height } = hasScreenFrame ? screenCanvas : { width: MAX_OUTPUT_WIDTH, height: MAX_OUTPUT_HEIGHT };
    if (outputCanvas.width !== width || outputCanvas.height !== height) {
      outputCanvas.width = width;
      outputCanvas.height = height;
    }
    outputCtx.globalAlpha = 1;
    if (hasScreenFrame) {
      outputCtx.drawImage(screenCanvas, 0, 0);
    } else {
      outputCtx.fillStyle = "#000";
      outputCtx.fillRect(0, 0, width, height);
    }

    // Fading-out sources first, then the ones on their way in, so a new speaker fades in over the old one.
    // Each real camera keeps its own aspect ratio; the visible ones are spaced out in the order given.
    const shown = visibleIds.map((id) => sources.get(id)).filter((source): source is Source => !!source);
    const boxes = layoutGhosts(shown.map((source) => source.aspect), width, height, settings.scale, settings.position, settings.span);
    shown.forEach((source, index) => {
      source.box = boxes[index];
    });
    const drawable = Array.from(sources.values())
      .filter((source) => source.hasCutout && source.alpha > 0.003 && source.box)
      .sort((a, b) => a.target - b.target);
    for (const source of drawable) drawGhost(source, source.box as GhostBox, height);

    if (settings.image) drawImageOverlay(width, height, settings.image, settings.imageCorner);
    let caption = settings.caption.trim();
    if (!caption && settings.autoCaption && sources.size > 1) {
      caption = shown
        .map((source) => source.label.trim())
        .filter(Boolean)
        .join(" · ");
    }
    if (caption) drawCaption(width, height, caption);

    return new VideoFrame(outputCanvas, { timestamp });
  }

  /** The host's camera: segmented at output rate, and every one of its frames also drives a composed output frame. */
  async function pumpLocal(source: Source) {
    while (!stopped) {
      const { value: frame, done } = await source.reader.read();
      if (done || !frame) return;
      const now = performance.now();
      if (now - lastOutputAt < MIN_FRAME_INTERVAL_MS) {
        frame.close();
        continue;
      }
      lastOutputAt = now;
      let output: VideoFrame | null = null;
      try {
        const timestamp = frame.timestamp;
        processFrame(source, frame, now, 0);
        stepFades(now);
        output = compose(timestamp);
        await writer.write(output);
      } catch (error) {
        output?.close();
        if (!stopped) throw error;
      }
    }
  }

  /** Someone else's camera: drained continuously, segmented only while it's on screen and at most ~12 times a second. */
  async function pumpRemote(source: Source) {
    while (!stopped) {
      const { value: frame, done } = await source.reader.read();
      if (done || !frame) return;
      processFrame(source, frame, performance.now(), GUEST_SEGMENT_INTERVAL_MS);
    }
  }

  function startPump(source: Source, pump: (source: Source) => Promise<void>) {
    pump(source).catch((error) => {
      // A single guest's track ending or failing must not take the whole overlay down.
      if (stopped || sources.get(source.id) !== source) return;
      if (source.isLocal) {
        stop();
        onError(error);
      } else {
        console.warn("[presenter-overlay] dropping a camera source", source.id, error);
        removeSource(source.id);
      }
    });
  }

  function addSource(input: OverlaySource) {
    if (stopped || sources.has(input.id)) return;
    const source = createSource(input.id, input.label, input.isLocal, input.track);
    sources.set(input.id, source);
    startPump(source, input.isLocal ? pumpLocal : pumpRemote);
  }

  function removeSource(id: string) {
    const source = sources.get(id);
    if (!source) return;
    sources.delete(id);
    source.reader.cancel().catch(() => {});
  }

  function setVisible(ids: string[]) {
    visibleIds = ids;
    for (const source of Array.from(sources.values())) source.target = ids.includes(source.id) ? 1 : 0;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    screenReader.cancel().catch(() => {});
    for (const source of Array.from(sources.values())) source.reader.cancel().catch(() => {});
    sources.clear();
    writer.close().catch(() => {});
    generator.stop();
  }

  addSource({ id: LOCAL_ID, label: cameraLabel, track: cameraTrack, isLocal: true });
  setVisible([LOCAL_ID]);
  pumpScreen().catch((error) => {
    if (stopped) return;
    stop();
    onError(error);
  });

  return { track: generator, settings, addSource, removeSource, setVisible, stop };
}
