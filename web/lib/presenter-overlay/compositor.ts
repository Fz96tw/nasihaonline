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
 * the *host's own webcam's* MediaStreamTrackProcessor frame stream, not
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
 *
 * Host gestures and air-draw (ported from showup/lib/presenter-overlay/,
 * trimmed to the core poses — see gestures.ts's and drawing.ts's doc
 * comments): point to show a laser dot, pinch to zoom/pan the screen layer,
 * open palm to reset, two fingers together to air-draw. Off by default;
 * loads the hand-landmark model the first time they're switched on. Only
 * ever active while the host's own ghost is on the share — there is no
 * camera-only mode, and if a guest's ghost is currently shown instead (see
 * "Follow the speaker" below) there's nothing for a gesture to point at.
 *
 * Multiple cameras (ported from showup/lib/presenter-overlay/): the
 * compositor can hold more than one camera at once — the host's own, added
 * at startup, plus any guest's (addSource/removeSource, driven by the
 * caller sampling the room) — and setVisible names which of them are drawn
 * right now, in this order, spaced along the bottom when there's more than
 * one (layoutGhosts). Anyone previously shown but no longer named fades out
 * as the new set fades in, over ~300ms. Deciding *who* is shown is the
 * caller's job, for either of two independent reasons:
 * - "Follow the speaker" (speaker-follow.ts): with nobody pinned to the
 *   overlay, exactly one id is ever named — whoever's currently speaking.
 * - "Guests on the overlay" / co-ghosts (co-ghosts.ts): the host can invite
 *   up to two guests who then stay up alongside the host regardless of who
 *   is speaking, so multiple ids are named at once.
 * This module doesn't know which reason is in play — it only knows how to
 * lay out and fade between whichever ids it's told.
 */

import type { HandLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import { GestureTracker, cameraToOutput, type GestureState, type GhostPlacement } from "./gestures.ts";
import { StrokeBoard, strokeColor, type PenColor } from "./drawing.ts";
import { ScreenViewport, outputToScreen, screenToOutput } from "./screen-zoom.ts";
import { SizeNormalizer, measureFromRows } from "./size-normalize.ts";
import { WindowSmoother, clampWindow, panelAspect, personBounds, targetCentre, tracePanelPath, windowSize, type PanelShape, type PersonBounds } from "./panel.ts";

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
const HAND_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

/** Output cap — matches the recording's EncodingOptions (1280×720 @ 20fps) in lib/livekit-egress.ts. */
const MAX_OUTPUT_WIDTH = 1280;
const MAX_OUTPUT_HEIGHT = 720;
const MIN_FRAME_INTERVAL_MS = 1000 / 20;
/** Each camera is segmented within this box (keeping its own aspect ratio) — plenty for a translucent cut-out, and keeps the per-frame mask readback cheap. */
const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 360;
/** The host's own camera drives the output frame rate and is segmented every output frame; a guest shown via "Follow the speaker" is throttled. */
const GUEST_SEGMENT_INTERVAL_MS = 1000 / 12;
/** Keep-background panel mode: how often the person is re-located in the frame (the crop itself still redraws every frame). */
const PANEL_SEGMENT_INTERVAL_MS = 250;
/** How long a ghost takes to fade in or out when the shown person changes. */
const CROSSFADE_MS = 300;
/** Hand detection runs at most ~14 times a second, and slower still if a detection ever takes long — independent of (and
 * throttled separately from) the 20fps segmentation above, so gestures don't cost the cut-out its frame rate. */
const HAND_INTERVAL_MS = 70;
/** The laser dot's trail lasts this long. */
const LASER_TRAIL_MS = 250;

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** What the gesture tracker currently recognizes, for the host's own (not streamed) indicator. */
export type GestureLabel = GestureState["label"] | "unavailable";

export type PresenterOverlaySettings = {
  /** 0–1, how solid the shown cut-out is drawn over the screen. */
  opacity: number;
  /** 0.3–1, cut-out height as a fraction of the output height. */
  scale: number;
  /** Horizontal anchor of the cut-out (always bottom-aligned, like someone standing in front of the slide). */
  position: "left" | "center" | "right";
  /**
   * Scale the cut-out so the camera frame covers the whole shared frame (whichever edge needs the larger
   * scale), so the presenter can reach any part of a wide window. Ignores `scale` and `position`; the top
   * or sides of the frame may be cropped. Only applies when there's a single ghost — a group (co-ghosts)
   * keeps the normal spaced-out layout.
   */
  span: boolean;
  /**
   * Scale each shown cut-out by how far that person sits from their camera, so everyone looks about the
   * same size whether they lean back or move their laptop. On by default. Off = every camera frame is
   * scaled the same (zoom 1), driven only by `scale`.
   */
  normalizeSize: boolean;
  /**
   * "remove" cuts the person out (default); "keep" shows the camera with its real background as a shaped
   * panel centred on them. Applies to every ghost, host and guests alike.
   */
  background: "remove" | "keep";
  /** Outline of the "keep" panel. */
  panelShape: PanelShape;
  /** Feather the panel's edge so it fades out instead of ending in a hard line. */
  softEdge: boolean;
  /**
   * Flip the cut-out horizontally, like a mirror — on by default, because
   * the presenter aims by watching their own image over the slide: when it
   * moves the way a mirror would, reaching toward something on their screen
   * lands their image's hand on it (the weather-presenter setup). Viewers
   * see the hand on the same item, so pointing reads correctly for them
   * too; the only visible cost is reversed text on clothing. Applies to
   * whoever is shown, host or guest alike — there's only ever this one rule.
   */
  mirror: boolean;
  /**
   * Host hand gestures: point to show a laser dot, pinch to zoom the screen (pan by moving the pinched
   * hand), open palm to reset, two fingers together to air-draw. Off by default. Host-only, and only act
   * while the host's own ghost is on the share (see "Follow the speaker" above).
   */
  gestures: boolean;
  /** Colour of the air-draw pen. */
  penColor: PenColor;
  caption: string;
  image: ImageBitmap | null;
  imageCorner: OverlayCorner;
};

export const DEFAULT_PRESENTER_OVERLAY_SETTINGS: PresenterOverlaySettings = {
  opacity: 0.5,
  scale: 1,
  position: "center",
  span: false,
  normalizeSize: true,
  background: "remove",
  panelShape: "rounded",
  softEdge: false,
  mirror: true,
  gestures: false,
  penColor: "red",
  caption: "",
  image: null,
  imageCorner: "top-right",
};

/** One camera that can be shown as the ghost: the host's own, or a guest's. */
export type OverlaySource = {
  id: string;
  /** Shown nowhere yet (there's no auto-caption here), but kept for a future one and for logging. */
  label: string;
  track: MediaStreamTrack;
  /** The host's own camera — the one that drives the output frame rate and that gestures act through. */
  isLocal: boolean;
};

export type PresenterOverlayCompositor = {
  /** The combined track, ready for localParticipant.publishTrack(..., { source: ScreenShare }). */
  track: MediaStreamTrack;
  /** Mutated in place by the UI; read fresh on every frame, so changes apply without a restart. */
  settings: PresenterOverlaySettings;
  /** Adds a camera (e.g. a guest whose camera just came on). No-op if the id is already there. Not shown until setVisible names it. */
  addSource: (source: OverlaySource) => void;
  removeSource: (id: string) => void;
  /** Which cameras' cut-outs are drawn, in this order (spaced out along the bottom when there's more than one). Anyone previously shown but no longer named fades out as these fade in, over ~300ms. */
  setVisible: (ids: string[]) => void;
  /** Zooms the screen layer 2x toward its centre (the same zoom a pinch gives). No-op when already zoomed. */
  zoomIn: () => void;
  /** Back to the whole screen. */
  resetZoom: () => void;
  /** Removes every air-drawn stroke. */
  clearDrawing: () => void;
  /** Stops every reader and the output track (the segmenter is kept for reuse). Does NOT stop the input tracks — the caller owns those. */
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

let handLandmarkerPromise: Promise<HandLandmarker> | null = null;

/** Lazily loads MediaPipe's hand model the first time gestures are switched on; reused afterwards. */
function loadHandLandmarker(): Promise<HandLandmarker> {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = (async () => {
      const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_LANDMARKER_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
      });
    })().catch((error) => {
      handLandmarkerPromise = null; // allow a retry the next time gestures are switched on
      throw error;
    });
  }
  return handLandmarkerPromise;
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

/** Fits a camera frame inside the CAMERA_WIDTH×CAMERA_HEIGHT segmentation box, keeping its own aspect ratio (never enlarged past it). */
export function fitBox(width: number, height: number): { width: number; height: number } {
  const ratio = Math.min(CAMERA_WIDTH / width, CAMERA_HEIGHT / height);
  return { width: Math.max(2, Math.round(width * ratio)), height: Math.max(2, Math.round(height * ratio)) };
}

/** Where one ghost is drawn on the output frame (bottom-aligned; the top edge is height - box.height). */
export type GhostBox = { x: number; width: number; height: number };

/** With several ghosts each is drawn a little smaller, so they read as a group rather than a pile. */
const GROUP_SCALE = [1, 1, 0.85, 0.7];

/**
 * Lays ghosts out bottom-aligned. One ghost follows the `position` setting; two or three are spaced evenly
 * across the width in the order given (the order they were added), each centred in its own slot. With
 * `span`, a lone ghost instead covers the whole frame (ignoring zoom). `zooms` scales each ghost about its
 * bottom edge (see size-normalize.ts). Pure, for testing.
 */
export function layoutGhosts(
  aspects: number[],
  outputWidth: number,
  outputHeight: number,
  scale: number,
  position: PresenterOverlaySettings["position"],
  span = false,
  zooms: number[] = [],
): GhostBox[] {
  const count = aspects.length;
  if (count === 1 && span) {
    // Cover fit, bottom-aligned and centred: the camera frame's edges land on (or past) the share's edges.
    const height = Math.max(outputHeight, outputWidth / aspects[0]);
    const width = height * aspects[0];
    return [{ x: (outputWidth - width) / 2, width, height }];
  }
  const groupHeight = outputHeight * scale * (GROUP_SCALE[Math.min(count, GROUP_SCALE.length - 1)] ?? 1);
  return aspects.map((aspect, index) => {
    // A zoomed ghost keeps its bottom edge and its anchor; it may run past the sides or top and is clipped by the output.
    const height = groupHeight * (zooms[index] ?? 1);
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

export async function startPresenterOverlayCompositor({
  screenTrack,
  cameraTrack,
  cameraLabel = "",
  onError,
  onGesture,
}: {
  screenTrack: MediaStreamTrack;
  cameraTrack: MediaStreamTrack;
  /** The host's own name, for their OverlaySource label. */
  cameraLabel?: string;
  onError: (error: unknown) => void;
  /** Tells the host's UI what gesture is recognized (or that the hand model couldn't load). Not drawn into the stream. */
  onGesture?: (label: GestureLabel) => void;
}): Promise<PresenterOverlayCompositor> {
  const { Processor, Generator } = insertableStreams();
  if (!Processor || !Generator) throw new Error("This browser can't combine video tracks. Try Chrome or Edge.");

  const segmenter = await loadSegmenter();

  const settings: PresenterOverlaySettings = { ...DEFAULT_PRESENTER_OVERLAY_SETTINGS };
  const generator = new Generator({ kind: "video" });
  const writer = generator.writable.getWriter();

  const LOCAL_ID = "local";

  // Latest screen image, refreshed only when the screen actually changes.
  const screenCanvas = new OffscreenCanvas(2, 2);
  const screenCtx = context2d(screenCanvas);
  let hasScreenFrame = false;

  const outputCanvas = new OffscreenCanvas(MAX_OUTPUT_WIDTH, MAX_OUTPUT_HEIGHT);
  const outputCtx = context2d(outputCanvas);

  let stopped = false;
  let lastOutputAt = 0;
  // MediaPipe requires strictly increasing timestamps within a VIDEO-mode session; every source shares this one sequence.
  let lastSegmentTimestamp = 0;

  /** Everything one camera needs: its reader, its own segmentation canvases, and its fade state. */
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
    /** What was last drawn for this source: a background-removed cut-out (cutoutCanvas) or a shaped "keep background" panel (panelCanvas). */
    mode: "cutout" | "panel";
    /** Sits-close-or-far correction for this camera (cut-outs only). */
    normalizer: SizeNormalizer;
    /** Person pixels per mask row, filled while the mask is converted; reused between frames. */
    rowCounts: Uint32Array;
    panelCanvas: OffscreenCanvas;
    panelCtx: OffscreenCanvasRenderingContext2D;
    panelShape: PanelShape;
    /** The part of the camera frame the panel shows (0–1 of the frame), so a fingertip can be mapped onto it. */
    panelCrop: { x: number; y: number; width: number; height: number } | null;
    /** Latest person location (panel mode); null when nobody was found. */
    person: PersonBounds | null;
    smoother: WindowSmoother;
    /** Camera size and shape the smoother's position refers to; a change re-centres it. */
    smootherKey: string;
    /** Where this source is drawn, computed fresh each frame while it's the visible one and kept (unchanged) while it fades out. */
    box: { x: number; y: number; width: number; height: number } | null;
  };

  const sources = new Map<string, Source>();
  /** The ids setVisible last named — what every source's `target` is derived from. */
  let visibleIds: string[] = [LOCAL_ID];
  let lastFadeAt = 0;

  function createSource(id: string, label: string, isLocal: boolean, track: MediaStreamTrack): Source {
    const cameraCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
    const maskCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
    const cutoutCanvas = new OffscreenCanvas(CAMERA_WIDTH, CAMERA_HEIGHT);
    const panelCanvas = new OffscreenCanvas(2, 2);
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
      mode: "cutout",
      normalizer: new SizeNormalizer(),
      rowCounts: new Uint32Array(CAMERA_HEIGHT),
      panelCanvas,
      panelCtx: context2d(panelCanvas),
      panelShape: "rounded",
      panelCrop: null,
      person: null,
      smoother: new WindowSmoother(CAMERA_WIDTH / 2, CAMERA_HEIGHT / 2),
      smootherKey: "",
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

  function updateCutout(source: Source, now: number) {
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
      // Count person pixels per row in the same pass, to measure how far this person sits from the camera.
      if (source.rowCounts.length !== mask.height) source.rowCounts = new Uint32Array(mask.height);
      const rowCounts = source.rowCounts;
      rowCounts.fill(0);
      let column = 0;
      let row = 0;
      for (let i = 0; i < confidence.length; i++) {
        const person = single ? confidence[i] : 1 - confidence[i];
        data[i * 4 + 3] = person * 255;
        if (person > 0.5) rowCounts[row]++;
        if (++column === mask.width) {
          column = 0;
          row++;
        }
      }
      source.normalizer.observe(now, measureFromRows(rowCounts, mask.width, mask.height));
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
    source.mode = "cutout";
  }

  /** Panel mode: segment only to find where the person is (no cut-out is made). */
  function updatePerson(source: Source) {
    const timestamp = Math.max(performance.now(), lastSegmentTimestamp + 1);
    lastSegmentTimestamp = timestamp;
    segmenter.segmentForVideo(source.cameraCanvas, timestamp, (result) => {
      const masks = result.confidenceMasks;
      if (!masks || masks.length === 0) return;
      const mask = masks[0];
      source.person = personBounds(mask.getAsFloat32Array(), mask.width, mask.height, masks.length === 1);
    });
  }

  /** Panel mode: crops the camera to a window centred on the person (clamped to the frame) and masks it to the chosen shape. */
  function updatePanel(source: Source, now: number) {
    const camW = source.cameraCanvas.width;
    const camH = source.cameraCanvas.height;
    const shape = settings.panelShape;
    const size = windowSize(shape, camW, camH);
    const target = targetCentre(shape, source.person, camW, camH);
    const key = `${shape}:${camW}x${camH}`;
    if (source.smootherKey !== key) {
      source.smootherKey = key;
      source.smoother.reset(target.x, target.y);
    }
    const centre = source.smoother.update(now, target.x, target.y, camW);
    const win = clampWindow(centre.x, centre.y, size.width, size.height, camW, camH);
    const w = Math.max(2, Math.round(win.width));
    const h = Math.max(2, Math.round(win.height));
    const { panelCanvas, panelCtx } = source;
    if (panelCanvas.width !== w || panelCanvas.height !== h) {
      panelCanvas.width = w;
      panelCanvas.height = h;
    }
    panelCtx.globalCompositeOperation = "copy";
    panelCtx.drawImage(source.cameraCanvas, win.x, win.y, win.width, win.height, 0, 0, w, h);
    // Keep only what's inside the shape; with a soft edge the outline is drawn blurred, so the panel fades out.
    panelCtx.globalCompositeOperation = "destination-in";
    if (settings.softEdge) {
      const margin = Math.min(w, h) * 0.08;
      panelCtx.filter = `blur(${margin * 0.6}px)`;
      tracePanelPath(panelCtx, shape, { x: margin, y: margin, width: w - margin * 2, height: h - margin * 2 });
    } else {
      tracePanelPath(panelCtx, shape, { x: 0, y: 0, width: w, height: h });
    }
    panelCtx.fillStyle = "#000";
    panelCtx.fill();
    panelCtx.filter = "none";
    panelCtx.globalCompositeOperation = "source-over";
    source.panelShape = shape;
    source.panelCrop = { x: win.x / camW, y: win.y / camH, width: win.width / camW, height: win.height / camH };
    source.hasCutout = true;
    source.mode = "panel";
  }

  /** Handles one camera frame for a source; always closes it. Returns true if fresh content (cut-out or panel) was made. */
  function processFrame(source: Source, frame: VideoFrame, now: number, minIntervalMs: number): boolean {
    try {
      if (settings.background === "keep") {
        drawCamera(source, frame);
        frame.close();
        if (now - source.lastSegmentAt >= PANEL_SEGMENT_INTERVAL_MS) {
          source.lastSegmentAt = now;
          updatePerson(source);
        }
        updatePanel(source, now);
        return true;
      }
      if (!isNeeded(source) || now - source.lastSegmentAt < minIntervalMs) return false;
      source.lastSegmentAt = now;
      drawCamera(source, frame);
      frame.close();
      updateCutout(source, now);
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

  /** The output frame size for this moment — the screen's own size once one has arrived, or the cap before that. */
  function outputSize(): { width: number; height: number } {
    return hasScreenFrame ? { width: screenCanvas.width, height: screenCanvas.height } : { width: MAX_OUTPUT_WIDTH, height: MAX_OUTPUT_HEIGHT };
  }

  /** Where a source is drawn, for mapping a fingertip onto it; null when it isn't on the share. */
  function placementFor(id: string): GhostPlacement | null {
    const source = sources.get(id);
    if (!source || !source.box || source.target <= 0 || !source.hasCutout) return null;
    return {
      x: source.box.x,
      y: source.box.y,
      width: source.box.width,
      height: source.box.height,
      mirror: settings.mirror,
      crop: source.mode === "panel" ? source.panelCrop : null,
    };
  }

  /** Where the host's own ghost is drawn; null when a guest is currently shown instead (or the host isn't ready yet). Gestures act only through this. */
  function hostPlacement(): GhostPlacement | null {
    return placementFor(LOCAL_ID);
  }

  /** Air-drawn strokes, on top of the (zoomed) screen layer and under the ghost. They live in screen coordinates, so they follow the zoom view. */
  function drawStrokes(now: number, width: number, height: number) {
    const shown = board.visible(now);
    if (shown.length === 0) return;
    const view = viewport.rect(now);
    outputCtx.save();
    outputCtx.lineCap = "round";
    outputCtx.lineJoin = "round";
    outputCtx.lineWidth = Math.max(3, height * 0.006);
    for (const { stroke, alpha } of shown) {
      if (stroke.points.length === 0) continue;
      const points = stroke.points.map((point) => {
        const at = screenToOutput(view, point.x, point.y);
        return { x: at.x * width, y: at.y * height };
      });
      const color = strokeColor(stroke.color);
      outputCtx.globalAlpha = alpha;
      outputCtx.strokeStyle = color;
      outputCtx.shadowColor = color;
      outputCtx.shadowBlur = outputCtx.lineWidth * 2;
      outputCtx.beginPath();
      outputCtx.moveTo(points[0].x, points[0].y);
      if (points.length === 1) {
        outputCtx.lineTo(points[0].x + 0.1, points[0].y);
      } else {
        // Curve through the midpoints, so the coarse ~14 Hz samples don't show as corners.
        for (let i = 1; i < points.length - 1; i++) {
          outputCtx.quadraticCurveTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2, (points[i].y + points[i + 1].y) / 2);
        }
        const last = points[points.length - 1];
        outputCtx.lineTo(last.x, last.y);
      }
      outputCtx.stroke();
    }
    outputCtx.restore();
  }

  /** The glowing red laser dot at the host's fingertip, with a short fading trail. */
  function drawLaser(now: number, height: number) {
    if (!pointer) {
      trail = [];
      return;
    }
    const placement = hostPlacement();
    if (!placement) {
      trail = [];
      return;
    }
    const at = cameraToOutput(pointer.u, pointer.v, placement);
    trail.push({ x: at.x, y: at.y, t: now });
    trail = trail.filter((point) => now - point.t <= LASER_TRAIL_MS);
    const radius = Math.max(5, height * 0.012);
    outputCtx.save();
    for (const point of trail) {
      const age = (now - point.t) / LASER_TRAIL_MS;
      outputCtx.globalAlpha = (1 - age) * 0.35 * pointer.fade;
      outputCtx.fillStyle = "#ff2a2a";
      outputCtx.beginPath();
      outputCtx.arc(point.x, point.y, radius * (1 - age * 0.5), 0, Math.PI * 2);
      outputCtx.fill();
    }
    outputCtx.globalAlpha = pointer.fade;
    const glow = outputCtx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius * 3);
    glow.addColorStop(0, "rgba(255, 60, 60, 0.9)");
    glow.addColorStop(0.35, "rgba(255, 40, 40, 0.45)");
    glow.addColorStop(1, "rgba(255, 0, 0, 0)");
    outputCtx.fillStyle = glow;
    outputCtx.beginPath();
    outputCtx.arc(at.x, at.y, radius * 3, 0, Math.PI * 2);
    outputCtx.fill();
    outputCtx.fillStyle = "#ff3030";
    outputCtx.beginPath();
    outputCtx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    outputCtx.fill();
    outputCtx.fillStyle = "#fff";
    outputCtx.beginPath();
    outputCtx.arc(at.x, at.y, radius * 0.4, 0, Math.PI * 2);
    outputCtx.fill();
    outputCtx.restore();
  }

  // Gestures: the tracker, the screen zoom, the stroke board and the hand model (loaded on first use). Host-only.
  const viewport = new ScreenViewport();
  const board = new StrokeBoard();
  let tracker = new GestureTracker();
  let hand: HandLandmarker | null = null;
  let handLoading = false;
  let lastHandAt = 0;
  let lastHandMs = 0;
  let lastHandTimestamp = 0;
  let lastLabel: GestureLabel = null;
  let pointer: GestureState["pointer"] = null;
  let lastPan: { x: number; y: number } | null = null;
  let trail: { x: number; y: number; t: number }[] = [];

  function setLabel(label: GestureLabel) {
    if (label === lastLabel) return;
    lastLabel = label;
    onGesture?.(label);
  }

  /**
   * Runs hand detection on the host's latest camera frame (throttled, independent of the segmentation rate)
   * and applies what it recognizes. With the host's own ghost off the share — a guest is currently shown
   * instead — there's nothing for a gesture to point at, so detection is skipped and anything in progress ends.
   */
  function runGestures(source: Source, now: number) {
    if (!settings.gestures) {
      board.end(now);
      if (pointer || lastLabel) {
        tracker = new GestureTracker();
        pointer = null;
        lastPan = null;
        setLabel(null);
      }
      return;
    }
    if (!hand) {
      if (!handLoading) {
        handLoading = true;
        loadHandLandmarker()
          .then((loaded) => {
            hand = loaded;
          })
          .catch((error) => {
            console.warn("[presenter-overlay] the hand model didn't load", error);
            setLabel("unavailable");
          })
          .finally(() => {
            handLoading = false;
          });
      }
      return;
    }
    // Skip detection frames rather than delay output frames when the machine is struggling.
    if (now - lastHandAt < Math.max(HAND_INTERVAL_MS, lastHandMs * 3)) return;
    lastHandAt = now;
    const placement = hostPlacement();
    let landmarks: { x: number; y: number }[] | null = null;
    if (placement) {
      const started = performance.now();
      lastHandTimestamp = Math.max(started, lastHandTimestamp + 1);
      try {
        landmarks = hand.detectForVideo(source.cameraCanvas, lastHandTimestamp).landmarks[0] ?? null;
      } catch (error) {
        console.warn("[presenter-overlay] hand detection failed", error);
      }
      lastHandMs = performance.now() - started;
    }
    const state = tracker.update(now, landmarks, source.aspect);
    pointer = state.pointer;
    // Air-draw: the pen tip goes through the same ghost mapping as the laser, then to screen coordinates through the current zoom view.
    if (placement && state.pen) {
      const out = cameraToOutput(state.pen.u, state.pen.v, placement);
      const { width, height } = outputSize();
      const onScreen = outputToScreen(viewport.rect(now), out.x / width, out.y / height);
      if (!board.drawing) board.begin(now, settings.penColor);
      board.add(onScreen.x, onScreen.y);
    } else {
      board.end(now);
    }
    let panned = false;
    for (const action of state.actions) {
      if (!placement) break;
      if (action.type === "reset") {
        viewport.reset(now);
        continue;
      }
      const out = cameraToOutput(action.u, action.v, placement);
      const { width, height } = outputSize();
      const at = { x: Math.min(1, Math.max(0, out.x / width)), y: Math.min(1, Math.max(0, out.y / height)) };
      if (action.type === "zoom") {
        viewport.zoomIn(now, at.x, at.y);
        lastPan = at;
        panned = true;
      } else {
        if (lastPan) viewport.pan(at.x - lastPan.x, at.y - lastPan.y);
        lastPan = at;
        panned = true;
      }
    }
    if (!panned) lastPan = null;
    setLabel(state.label);
  }

  /** Moves every source's fade toward its target, so a change of who's shown crossfades over ~300ms. */
  function stepFades(now: number) {
    const dt = lastFadeAt === 0 ? 0 : now - lastFadeAt;
    lastFadeAt = now;
    const step = dt / CROSSFADE_MS;
    for (const source of Array.from(sources.values())) {
      if (source.alpha < source.target) source.alpha = Math.min(source.target, source.alpha + step);
      else if (source.alpha > source.target) source.alpha = Math.max(source.target, source.alpha - step);
    }
  }

  /** Width / height a source is laid out at: its panel's shape, or the camera's own aspect for a cut-out. */
  function layoutAspect(source: Source): number {
    return source.mode === "panel" ? panelAspect(source.panelShape) : source.aspect;
  }

  /** The top edge a ghost is drawn at: bottom-aligned, and a panel circle floats a little above the bottom edge (only if there's room). */
  function ghostTop(source: Source, box: GhostBox, height: number): number {
    let y = height - box.height;
    if (source.mode === "panel" && source.panelShape === "circle") y -= Math.min(height * 0.03, y);
    return y;
  }

  function drawGhost(source: Source, box: { x: number; y: number; width: number; height: number }) {
    outputCtx.globalAlpha = settings.opacity * source.alpha;
    const image = source.mode === "panel" ? source.panelCanvas : source.cutoutCanvas;
    if (settings.mirror) {
      outputCtx.save();
      outputCtx.translate(box.x + box.width, 0);
      outputCtx.scale(-1, 1);
      outputCtx.drawImage(image, 0, box.y, box.width, box.height);
      outputCtx.restore();
    } else {
      outputCtx.drawImage(image, box.x, box.y, box.width, box.height);
    }
    outputCtx.globalAlpha = 1;
  }

  function compose(timestamp: number) {
    const { width, height } = outputSize();
    if (outputCanvas.width !== width || outputCanvas.height !== height) {
      outputCanvas.width = width;
      outputCanvas.height = height;
    }
    outputCtx.globalAlpha = 1;
    const now = performance.now();
    if (hasScreenFrame) {
      // Only the screen layer is zoomed; the ghost, strokes, caption and image stay at their normal size.
      const view = viewport.rect(now);
      if (view.width >= 1) outputCtx.drawImage(screenCanvas, 0, 0);
      else outputCtx.drawImage(screenCanvas, view.x * width, view.y * height, view.width * width, view.height * height, 0, 0, width, height);
    } else {
      outputCtx.fillStyle = "#000";
      outputCtx.fillRect(0, 0, width, height);
    }

    drawStrokes(now, width, height);

    // Every currently-visible source gets a fresh box, laid out together (spaced out if there's more than
    // one); a source still fading out keeps whatever box it was drawn at last, so its outline doesn't jump
    // right before it disappears. Each source's own aspect ratio and zoom, in the order setVisible was given.
    const shown = visibleIds.map((id) => sources.get(id)).filter((source): source is Source => !!source);
    // A keep-background panel isn't a cut-out of a person to size, so it stays at zoom 1.
    const zooms = shown.map((source) => (source.mode === "panel" ? 1 : source.normalizer.zoom(now, settings.normalizeSize)));
    const boxes = layoutGhosts(shown.map(layoutAspect), width, height, settings.scale, settings.position, settings.span, zooms);
    shown.forEach((source, index) => {
      const box = boxes[index];
      source.box = { x: box.x, y: ghostTop(source, box, height), width: box.width, height: box.height };
    });
    // Fading-out first, then the ones fading in, so a new speaker/co-ghost fades in over the old one.
    const drawable = Array.from(sources.values())
      .filter((source) => source.hasCutout && source.alpha > 0.003 && source.box)
      .sort((a, b) => a.target - b.target);
    for (const source of drawable) drawGhost(source, source.box!);

    if (settings.image) drawImageOverlay(width, height, settings.image, settings.imageCorner);
    const caption = settings.caption.trim();
    if (caption) drawCaption(width, height, caption);

    drawLaser(now, height);

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
        runGestures(source, now);
        stepFades(now);
        output = compose(timestamp);
        await writer.write(output);
      } catch (error) {
        output?.close();
        if (!stopped) throw error;
      }
    }
  }

  /** A guest's camera: drained continuously, segmented only while its ghost is (or is still fading) on screen, and at most ~12 times a second. */
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

  function zoomIn() {
    viewport.zoomIn(performance.now(), 0.5, 0.5);
  }

  function resetZoom() {
    viewport.reset(performance.now());
  }

  function clearDrawing() {
    board.clear();
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

  return { track: generator, settings, addSource, removeSource, setVisible, zoomIn, resetZoom, clearDrawing, stop };
}
