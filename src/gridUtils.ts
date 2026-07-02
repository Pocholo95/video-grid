import {
  DEFAULTS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  HEADER_PADDING_LEFT,
  SEEK_TIMEOUT_MS,
  VIDEO_OPEN_TIMEOUT_MS,
} from "./constants";
import { computeTemplatePixelRects, templateFromUniform } from "./gridTemplate";
import type {
  GridTemplate,
  Position,
  VideoDecoderSetup,
  VideoMetadata,
  VrMode,
} from "./types";
import {
  buildMetadataLines,
  errlog,
  formatTime,
  hexToRgba,
  warn,
} from "./utils";

export type CellSlot = { x: number; y: number; cellW: number; cellH: number };

/**
 * Generates a grid layout describing the geometry of cells in the grid
 *
 * @param opts Task options
 * @param meta Metadata about the file being processed
 * @param headerHeight Header height to account for in the final canvas height.
 * @returns object An array of CellSlots and the size of the required canvas.
 */
export const getGridLayout = (
  opts: {
    width: number;
    cols: number;
    rows: number;
    spacing: number;
    gridTemplate?: GridTemplate;
    vrMode: VrMode;
  },
  meta: VideoMetadata,
  headerHeight: number = 0,
): { cellSlots: CellSlot[]; canvasWidth: number; canvasHeight: number } => {
  const useTemplate = !!(
    opts.gridTemplate && opts.gridTemplate.cells.length > 0
  );
  const template = useTemplate
    ? opts.gridTemplate!
    : templateFromUniform(opts.cols, opts.rows);

  const rectResult = computeTemplatePixelRects(
    template,
    Math.max(240, opts.width),
    Math.max(0, opts.spacing),
    meta,
    opts.vrMode,
    0,
  );

  // Shift slots if needed (e.g. header above)
  const cellSlots = rectResult.rects.map((r) => ({
    x: r.x,
    y: r.y + headerHeight,
    cellW: r.w,
    cellH: r.h,
  }));

  return {
    cellSlots,
    canvasWidth: rectResult.canvasWidth,
    canvasHeight: rectResult.canvasHeight + headerHeight,
  };
};

/**
 * Helper to prepare the header canvas if enabled.
 *
 * @param opts Task options
 * @param file Video file being processed
 * @param meta Metadata about the file being processed
 * @returns object Returns the header canvas and its height.
 */
export const prepareHeader = (
  opts: {
    header: boolean;
    bgColor: string;
    textColor: string;
    vrMode: VrMode;
    width: number;
    fontFamily: string;
    headerFontSizeAuto: boolean;
    headerFontSize: number;
  },
  file: File,
  meta: VideoMetadata,
): { headerCanvas: HTMLCanvasElement | undefined; headerHeight: number } => {
  if (!opts.header) return { headerCanvas: undefined, headerHeight: 0 };

  const headerCanvas = createHeaderCanvas(
    file,
    meta,
    opts.vrMode,
    Math.max(240, opts.width),
    opts.bgColor,
    opts.textColor,
    opts.fontFamily,
    opts.headerFontSizeAuto,
    opts.headerFontSize,
  );

  return { headerCanvas, headerHeight: headerCanvas.height };
};

/**
 * Returns the source crop rectangle for a VR stereo frame, isolating one eye.
 *
 * @param frameW - Width of the source frame in pixels
 * @param frameH - Height of the source frame in pixels
 * @param vrMode - VR mode excluding "disabled" (sbs-left, sbs-right, tb-left, tb-right)
 * @returns Crop rectangle {sx, sy, sw, sh} for canvas drawImage
 */
export const getVrCropRect = (
  frameW: number,
  frameH: number,
  vrMode: Exclude<VrMode, "disabled">,
): { sx: number; sy: number; sh: number; sw: number } => {
  if (vrMode === "sbs-left" || vrMode === "sbs-right") {
    const sw = Math.floor(frameW / 2);
    return { sx: vrMode === "sbs-right" ? sw : 0, sy: 0, sw, sh: frameH };
  }
  const sh = Math.floor(frameH / 2);
  return { sx: 0, sy: vrMode === "tb-right" ? sh : 0, sw: frameW, sh };
};

/**
 * Returns a human-readable label for the active VR crop mode.
 *
 * @param vrMode - VR mode including "disabled"
 * @returns Human-readable label for the VR mode, empty string for "disabled"
 */
export const vrModeLabel = (vrMode: VrMode): string => {
  switch (vrMode) {
    case "sbs-left":
      return "SBS - Crop Left Eye";
    case "sbs-right":
      return "SBS - Crop Right Eye";
    case "tb-left":
      return "TB - Crop Top (Left Eye)";
    case "tb-right":
      return "TB - Crop Bottom (Right Eye)";
    default:
      return "";
  }
};

/**
 * Converts timecode position string to x/y alignment for overlay placement.
 *
 * @param position - Position excluding "disabled" (top-left, top-right, bottom-left, bottom-right)
 * @returns Object with x ("left"|"right") and y ("top"|"bottom") alignment
 */
export const getTimecodePosition = (
  position: Exclude<Position, "disabled">,
): { x: "left" | "right"; y: "top" | "bottom" } => {
  const posMap: Record<
    Exclude<Position, "disabled">,
    { x: "left" | "right"; y: "top" | "bottom" }
  > = {
    "top-left": { x: "left", y: "top" },
    "top-right": { x: "right", y: "top" },
    "bottom-left": { x: "left", y: "bottom" },
    "bottom-right": { x: "right", y: "bottom" },
  };
  return posMap[position];
};

/**
 * Creates a canvas with file information header for video thumbnails.
 *
 * @param file - File object containing name and size
 * @param meta - Video metadata with width, height, duration, bitrate
 * @param vrMode - VR mode for optional VR status display
 * @param canvasWidth - Target width of the header canvas
 * @param bgColor - Background color (hex string)
 * @param textColor - Text color (hex string)
 * @returns Canvas element with rendered header text
 */
export const createHeaderCanvas = (
  file: File,
  meta: VideoMetadata,
  vrMode: VrMode,
  canvasWidth: number,
  bgColor: string,
  textColor: string,
  fontFamily: string,
  headerFontSizeAuto: boolean,
  headerFontSize: number,
): HTMLCanvasElement => {
  const vrActive = vrMode !== "disabled";

  const infoLines = buildMetadataLines(meta, file.name, file.size);
  if (vrActive) infoLines.push(`VR Video: ${vrModeLabel(vrMode)}`);

  const safeHeaderFontSize = Number.isFinite(headerFontSize)
    ? headerFontSize
    : DEFAULTS.headerFontSize;
  const headerFontSz = headerFontSizeAuto
    ? Math.max(14, Math.round(canvasWidth * 0.0125))
    : Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, safeHeaderFontSize));
  const lineSpacing = headerFontSz + 2;

  const headerHeight = HEADER_PADDING_LEFT * 2 + infoLines.length * lineSpacing;

  const headerCanvas = document.createElement("canvas");
  headerCanvas.width = canvasWidth;
  headerCanvas.height = headerHeight;

  const ctx = headerCanvas.getContext("2d")!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasWidth, headerHeight);
  ctx.fillStyle = textColor;
  ctx.font = `${headerFontSz}px ${fontFamily}`;
  ctx.textBaseline = "top";

  const maxTextWidth = canvasWidth - HEADER_PADDING_LEFT * 2;
  let yPos = HEADER_PADDING_LEFT;

  for (const line of infoLines) {
    let displayLine = line;
    if (ctx.measureText(displayLine).width > maxTextWidth) {
      while (
        displayLine.length > 0 &&
        ctx.measureText(displayLine + "…").width > maxTextWidth
      ) {
        displayLine = displayLine.slice(0, -1);
      }
      displayLine += "…";
    }
    ctx.fillText(displayLine, HEADER_PADDING_LEFT, yPos);
    yPos += lineSpacing;
  }

  ctx.textBaseline = "alphabetic";
  return headerCanvas;
};

/**
 * Draws timecode overlay with background in specified cell position.
 *
 * @param ctx - 2D canvas rendering context
 * @param tSec - Time in seconds to display
 * @param x - Cell X position
 * @param y - Cell Y position
 * @param cellWidth - Cell width
 * @param cellHeight - Cell height
 * @param totalWidth - Total canvas width (for font scaling)
 * @param position - Timecode position (disabled skips drawing)
 * @param bgColor - Background color (hex string)
 * @param textColor - Text color (hex string)
 */
export const drawTimecodeOverlay = (
  ctx: CanvasRenderingContext2D,
  tSec: number,
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  totalWidth: number,
  position: Position,
  bgColor: string,
  textColor: string,
  fontFamily: string,
  tcFontSizeAuto: boolean,
  tcFontSize: number,
): void => {
  if (position === "disabled") return;

  const label = formatTime(tSec);
  const safeTcFontSize = Number.isFinite(tcFontSize)
    ? tcFontSize
    : DEFAULTS.tcFontSize;
  const tcFontSz = tcFontSizeAuto
    ? Math.max(11, Math.round(totalWidth * 0.0073))
    : Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, safeTcFontSize));
  ctx.font = `${tcFontSz}px ${fontFamily}`;
  ctx.textBaseline = "top";

  const textW = ctx.measureText(label).width;
  const pad = 6;
  const bgW = textW + pad * 2;
  const bgH = tcFontSz + pad * 2;
  const pos = getTimecodePosition(position as Exclude<Position, "disabled">);
  const bgX = pos.x === "left" ? x + pad : x + cellWidth - bgW - pad;
  const bgY = pos.y === "top" ? y + pad : y + cellHeight - bgH - pad;

  ctx.fillStyle = hexToRgba(bgColor, 0.6);
  ctx.fillRect(bgX, bgY, bgW, bgH);
  ctx.fillStyle = textColor;
  ctx.fillText(label, bgX + pad, bgY + pad);
  ctx.textBaseline = "alphabetic";
};

/**
 * Draws error placeholder text centered in a cell.
 *
 * @param ctx - 2D canvas rendering context
 * @param x - Cell X position
 * @param y - Cell Y position
 * @param cellWidth - Cell width
 * @param cellHeight - Cell height
 * @param bgColor - Background color (hex string)
 */
export const drawErrorPlaceholder = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellWidth: number,
  cellHeight: number,
  bgColor: string,
): void => {
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, cellWidth, cellHeight);
  ctx.fillStyle = "#555";
  ctx.font = "18px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("FAILED", x + cellWidth / 2, y + cellHeight / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
};

/**
 * Calculates evenly distributed sample timestamps across video duration with margins.
 *
 * @param totalCells - Number of thumbnail cells to generate
 * @param duration - Total video duration in seconds
 * @returns Array of timestamp positions in seconds
 */
export const calculateSampleTimes = (
  totalCells: number,
  duration: number,
): number[] => {
  const margin = Math.max(0.5, duration * 0.02);
  const usable = Math.max(duration - 2 * margin, 0.1);
  return Array.from({ length: totalCells }, (_, i) =>
    Math.min(Math.max(0, margin + usable * ((i + 0.5) / totalCells)), duration),
  );
};

/**
 * Resolves the final list of cell timestamps, prioritizing custom markers.
 *
 * Custom markers are always used first (up to totalCells). Remaining cells are
 * filled with auto timestamps not already in custom markers, then the result
 * is sorted chronologically. All timestamps clamped to [0, duration - 0.001].
 *
 * @param custom - User-supplied marker timestamps in seconds.
 * @param totalCells - Number of cells in the grid (cols * rows).
 * @param duration - Video duration in seconds.
 * @returns Array of exactly `totalCells` timestamps in seconds, sorted ascending.
 */
export const resolveTimestamps = (
  custom: number[],
  totalCells: number,
  duration: number,
): number[] => {
  const maxT = Math.max(0, duration - 0.001);
  const clamped = custom
    .map((t) => Math.min(Math.max(0, t), maxT))
    .sort((a, b) => a - b);

  if (clamped.length >= totalCells) {
    return clamped.slice(0, totalCells);
  }

  const auto = calculateSampleTimes(totalCells, duration);
  const used = new Set(clamped.map((t) => Number(t.toFixed(6))));
  const result: number[] = [...clamped];

  for (const t of auto) {
    if (result.length >= totalCells) break;
    if (!used.has(Number(t.toFixed(6)))) {
      result.push(t);
    }
  }

  return result.sort((a, b) => a - b);
};

/**
 * Seeks a video element to the given time and resolves when the seek completes.
 * Rejects with a timeout error if the seek takes longer than SEEK_TIMEOUT_MS.
 *
 * @param video - The HTMLVideoElement to seek.
 * @param t - Target time in seconds.
 */
export const seekVideo = (video: HTMLVideoElement, t: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const tid = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error(`Seek timeout at ${t.toFixed(3)}s`));
    }, SEEK_TIMEOUT_MS);
    const onSeeked = () => {
      clearTimeout(tid);
      resolve();
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.currentTime = t;
  });

/**
 * Creates and validates a native `<video>` element for frame capture.
 *
 * Builds a video element backed by an ObjectURL, waits for the browser to
 * decode enough data to confirm the codec is supported (`canplay`), performs
 * a test seek, and verifies the decoded frame contains actual pixel data.
 *
 * On failure it logs a warning (when `onWarning` is provided) and returns
 * with `canNativelyPlay = false` so the caller can decide whether to fall
 * back to FFmpeg (static JPEG grid) or abort (animated WebP mode).
 *
 * @param file - The video File to decode.
 * @param meta - Pre-read metadata (duration, dimensions).
 * @param onWarning - Optional callback for non-fatal warnings.
 * @returns VideoDecoderSetup with the video element, cleanup, and capability flag.
 */
export const setupVideoDecoder = async (
  file: File,
  meta: VideoMetadata,
  onWarning?: (message: string) => void,
): Promise<VideoDecoderSetup> => {
  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  const videoCleanup = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  };

  let canNativelyPlay = true;
  try {
    // Step 1: Wait for 'canplay' — proves the codec is actually supported.
    // Listeners MUST be registered BEFORE setting video.src so that cached
    // files don't fire the event before we're listening.
    await new Promise<void>((resolve, reject) => {
      const tid = setTimeout(
        () => reject(new Error("Video canplay timeout")),
        VIDEO_OPEN_TIMEOUT_MS,
      );
      video.addEventListener(
        "canplay",
        () => {
          clearTimeout(tid);
          resolve();
        },
        { once: true },
      );
      video.addEventListener(
        "error",
        () => {
          clearTimeout(tid);
          reject(new Error("Video failed to load"));
        },
        { once: true },
      );
      // Set src AFTER listeners are attached to avoid missing events
      // when the browser fires them synchronously for cached files.
      video.src = videoUrl;
    });

    // Step 2: Test seek to verify seeking works (not just initial decode).
    // Use a conservative time well within the video bounds to avoid
    // non-deterministic failures on mobile when meta.duration is inaccurate.
    const duration = meta.duration ?? 10;
    const testTime = Math.min(1, duration * 0.05, duration - 1);
    await seekVideo(video, Math.max(0, testTime));

    // Step 3: Verify we have a decoded frame ready after seek.
    // On mobile browsers readyState can be flaky after a successful seek,
    // so we treat this as a soft check — only fail if the canvas draw
    // also produces an empty frame (Step 4).
    // HAVE_CURRENT_FRAME = 2, HAVE_FUTURE_DATA = 3
    if (video.readyState < 2) {
      warn(
        `Low readyState (${video.readyState}) after seek — ` +
          `proceeding to pixel check as final validation`,
      );
      // Do NOT throw here; let Step 4 be the decisive test.
    }

    // Step 4: Draw to offscreen canvas and verify pixels aren't empty.
    // This is the final and most reliable test — if the browser can
    // produce pixel data, the codec is usable regardless of readyState.
    const testCanvas = document.createElement("canvas");
    testCanvas.width = 16;
    testCanvas.height = 16;
    const testCtx = testCanvas.getContext("2d", { willReadFrequently: true })!;
    testCtx.drawImage(video, 0, 0, 16, 16);
    const imageData = testCtx.getImageData(0, 0, 16, 16);
    const hasPixelData = imageData.data.some((ch, i) => i % 4 === 3 && ch > 0);
    if (!hasPixelData) {
      throw new Error("Decoded frame is empty");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`Native video failed (${msg}), switching to FFmpeg`);
    errlog(`setupVideoDecoder error:`, e);
    onWarning?.(
      `Native decoder unavailable (${msg}) — using FFmpeg fallback (slower, more unreliable, and subject to memory limits)`,
    );
    canNativelyPlay = false;
  }

  // Reset to beginning for actual grid processing.
  // Only attempt this when native playback was confirmed working —
  // on failure the video element is in an undefined state and seeking
  // can throw or hang (especially on mobile Chrome).
  if (canNativelyPlay) {
    video.currentTime = 0;
  }

  return { video, videoCleanup, canNativelyPlay };
};
