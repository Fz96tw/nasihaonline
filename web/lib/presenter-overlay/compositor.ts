/**
 * Presenter camera overlay (objective 961a9322): combines the presenter's
 * screen capture with a background-removed, semi-transparent cut-out of
 * their webcam (plus an optional caption and local image) into a single
 * video track, which the caller publishes as the LiveKit ScreenShare source
 * — so the existing VideoConference focus layout and the "speaker" egress
 * layout (lib/livekit-egress.ts) show it with no server-side changes.
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
/** Webcam is segmented at this size — plenty for a translucent cut-out, and keeps the per-frame mask readback cheap. */
const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 360;

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type PresenterOverlaySettings = {
  /** 0–1, how solid the presenter's cut-out is drawn over the screen. */
  opacity: number;
  /** 0.3–1, cut-out height as a fraction of the output height. */
  scale: number;
  /** Horizontal anchor of the cut-out (always bottom-aligned, like someone standing in front of the slide). */
  position: "left" | "center" | "right";
  /**
   * Flip the cut-out horizontally, like a mirror — on by default, because
   * the presenter aims by watching their own image over the slide: when it
   * moves the way a mirror would, reaching toward something on their screen
   * lands their image's hand on it (the weather-presenter setup). Viewers
   * see the hand on the same item, so pointing reads correctly for them
   * too; the only visible cost is reversed text on clothing.
   */
  mirror: boolean;
  /**
   * Master switch for everything drawn over the screen (presenter, caption,
   * image). Off = a plain screen share, e.g. to step away briefly mid-meeting;
   * the other settings are kept for when it's turned back on. Segmentation
   * is skipped while off, so it also saves the CPU/GPU cost.
   */
  enabled: boolean;
  caption: string;
  image: ImageBitmap | null;
  imageCorner: OverlayCorner;
};

export const DEFAULT_PRESENTER_OVERLAY_SETTINGS: PresenterOverlaySettings = {
  opacity: 0.5,
  scale: 1,
  position: "center",
  mirror: true,
  enabled: true,
  caption: "",
  image: null,
  imageCorner: "top-right",
};

export type PresenterOverlayCompositor = {
  /** The combined track, ready for localParticipant.publishTrack(..., { source: ScreenShare }). */
  track: MediaStreamTrack;
  /** Mutated in place by the UI; read fresh on every frame, so changes apply without a restart. */
  settings: PresenterOverlaySettings;
  /** Stops both readers, the output track, and the segmenter. Does NOT stop the input tracks — the caller owns those. */
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

export async function startPresenterOverlayCompositor({
  screenTrack,
  cameraTrack,
  onError,
}: {
  screenTrack: MediaStreamTrack;
  cameraTrack: MediaStreamTrack;
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

  // Webcam → (segment) → mask → cut-out with transparent background.
  const cameraCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
  const cameraCtx = context2d(cameraCanvas);
  const maskCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
  const maskCtx = context2d(maskCanvas);
  let maskImage = new ImageData(CAMERA_WIDTH, CAMERA_HEIGHT);
  const cutoutCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
  const cutoutCtx = context2d(cutoutCanvas);

  const outputCanvas = new OffscreenCanvas(MAX_OUTPUT_WIDTH, MAX_OUTPUT_HEIGHT);
  const outputCtx = context2d(outputCanvas);

  let stopped = false;
  let lastOutputAt = 0;
  let lastSegmentTimestamp = 0;

  const screenReader = new Processor({ track: screenTrack }).readable.getReader();
  const cameraReader = new Processor({ track: cameraTrack }).readable.getReader();

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

  /** Center-crops the camera frame to 16:9 so a 4:3 webcam isn't stretched. */
  function drawCameraCover(frame: VideoFrame) {
    const sourceRatio = frame.displayWidth / frame.displayHeight;
    const targetRatio = CAMERA_WIDTH / CAMERA_HEIGHT;
    let sw = frame.displayWidth;
    let sh = frame.displayHeight;
    if (sourceRatio > targetRatio) sw = sh * targetRatio;
    else sh = sw / targetRatio;
    const sx = (frame.displayWidth - sw) / 2;
    const sy = (frame.displayHeight - sh) / 2;
    cameraCtx.drawImage(frame, sx, sy, sw, sh, 0, 0, CAMERA_WIDTH, CAMERA_HEIGHT);
  }

  function updateCutout() {
    // MediaPipe requires strictly increasing timestamps within a VIDEO-mode session.
    const timestamp = Math.max(performance.now(), lastSegmentTimestamp + 1);
    lastSegmentTimestamp = timestamp;
    segmenter.segmentForVideo(cameraCanvas, timestamp, (result) => {
      const masks = result.confidenceMasks;
      if (!masks || masks.length === 0) return;
      // selfie_segmenter has a single "person" confidence channel; a
      // multiclass model puts background in channel 0 instead.
      const single = masks.length === 1;
      const mask = masks[0];
      // Masks normally come back at the input size; resize our buffers if a model ever differs.
      if (mask.width !== maskImage.width || mask.height !== maskImage.height) {
        maskImage = new ImageData(mask.width, mask.height);
        maskCanvas.width = mask.width;
        maskCanvas.height = mask.height;
      }
      const confidence = mask.getAsFloat32Array();
      const data = maskImage.data;
      for (let i = 0; i < confidence.length; i++) {
        const person = single ? confidence[i] : 1 - confidence[i];
        data[i * 4 + 3] = person * 255;
      }
    });
    maskCtx.putImageData(maskImage, 0, 0);

    cutoutCtx.globalCompositeOperation = "copy";
    cutoutCtx.drawImage(cameraCanvas, 0, 0);
    cutoutCtx.globalCompositeOperation = "destination-in";
    // Soften the mask edge so the outline doesn't shimmer frame to frame.
    cutoutCtx.filter = "blur(2px)";
    cutoutCtx.drawImage(maskCanvas, 0, 0, CAMERA_WIDTH, CAMERA_HEIGHT);
    cutoutCtx.filter = "none";
    cutoutCtx.globalCompositeOperation = "source-over";
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

    if (!settings.enabled) return new VideoFrame(outputCanvas, { timestamp });

    // Presenter cut-out: bottom-aligned, mirrored unless turned off (see settings.mirror).
    const personHeight = height * settings.scale;
    const personWidth = personHeight * (CAMERA_WIDTH / CAMERA_HEIGHT);
    const x =
      settings.position === "left" ? 0 : settings.position === "right" ? width - personWidth : (width - personWidth) / 2;
    outputCtx.globalAlpha = settings.opacity;
    if (settings.mirror) {
      outputCtx.save();
      outputCtx.translate(x + personWidth, 0);
      outputCtx.scale(-1, 1);
      outputCtx.drawImage(cutoutCanvas, 0, height - personHeight, personWidth, personHeight);
      outputCtx.restore();
    } else {
      outputCtx.drawImage(cutoutCanvas, x, height - personHeight, personWidth, personHeight);
    }
    outputCtx.globalAlpha = 1;

    if (settings.image) drawImageOverlay(width, height, settings.image, settings.imageCorner);
    const caption = settings.caption.trim();
    if (caption) drawCaption(width, height, caption);

    return new VideoFrame(outputCanvas, { timestamp });
  }

  async function pumpCamera() {
    while (!stopped) {
      const { value: frame, done } = await cameraReader.read();
      if (done || !frame) return;
      const now = performance.now();
      if (now - lastOutputAt < MIN_FRAME_INTERVAL_MS) {
        frame.close();
        continue;
      }
      lastOutputAt = now;
      let output: VideoFrame | null = null;
      try {
        drawCameraCover(frame);
        const timestamp = frame.timestamp;
        frame.close();
        if (settings.enabled) updateCutout();
        output = compose(timestamp);
        await writer.write(output);
      } catch (error) {
        output?.close();
        if (!stopped) throw error;
      } finally {
        // Safe to call on an already-closed frame.
        frame.close();
      }
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    screenReader.cancel().catch(() => {});
    cameraReader.cancel().catch(() => {});
    writer.close().catch(() => {});
    generator.stop();
  }

  for (const pump of [pumpScreen, pumpCamera]) {
    pump().catch((error) => {
      if (stopped) return;
      stop();
      onError(error);
    });
  }

  return { track: generator, settings, stop };
}
