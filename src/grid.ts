import {
  cleanupFFmpeg,
  extractFramesFFmpegBatch,
  isAbortError,
  isMemoryError,
} from "./ffmpeg";
import type { GridTemplate, Position, VideoMetadata, VrMode } from "./types";
import { errlog, formatTime, log, warn } from "./utils";
import {
  calculateSampleTimes,
  drawErrorPlaceholder,
  drawTimecodeOverlay,
  getGridLayout,
  getVrCropRect,
  prepareHeader,
  resolveTimestamps,
  seekVideo,
  setupVideoDecoder,
} from "./gridUtils";

export type GridOptions = {
  width: number;
  cols: number;
  rows: number;
  spacing: number;
  position: Position;
  header: boolean;
  bgColor: string;
  textColor: string;
  /**
   * VR stereo crop mode. When set to anything other than "disabled", the
   * canvas drawImage call is adjusted to extract one eye from the stereo
   * frame rather than drawing the full frame into the cell.
   */
  vrMode: VrMode;
  /**
   * Optional per-file custom marker timestamps in seconds (sorted ascending).
   * When provided, replaces evenly-distributed auto sampling. Cells beyond
   * the end of the array still receive auto-calculated fallback times.
   */
  customTimestamps?: number[];
  /**
   * Optional custom grid template. When set and non-empty, this
   * overrides the uniform cols×rows layout.
   */
  gridTemplate?: GridTemplate;
};

export type GridResult = {
  outputName: string;
  outputSize: number;
  outputBlob: Blob;
};

/**
 * Build a JPEG contact sheet for a single video file.
 * Tries native browser seeking first, falling back to FFmpeg WASM if that fails.
 *
 * When `opts.gridTemplate` is set and non-empty, the cell layout is driven by
 * the template. Otherwise a uniform cols×rows grid is used.
 * Cell pixel sizes are computed from the template's coordinate
 * space.
 *
 * When `opts.vrMode` is not "disabled", the source rectangle passed to drawImage
 * is adjusted to crop one eye from the stereo frame. This works on both the
 * native and FFmpeg fallback paths without any additional processing overhead.
 * A note is added to the header when it is visible.
 *
 * When `opts.customTimestamps` is provided, those timestamps are used instead
 * of evenly-distributed automatic sampling. Cells beyond the list fall back to
 * auto-calculated times so the grid is always fully populated.
 *
 * @param file - The source video file.
 * @param meta - Pre-read metadata (dimensions, duration, etc.).
 * @param opts - Grid layout and appearance options.
 * @param isCancelled - Polled before each frame; return true to abort cleanly.
 * @param onFrameDone - Called after every frame to drive the progress bar.
 * @param onWarning - Called for non-fatal issues to show to the user.
 * @returns The output filename, byte size, and JPEG blob.
 */
export const createGridJpg = async (
  file: File,
  meta: VideoMetadata,
  opts: GridOptions,
  isCancelled: () => boolean,
  onFrameDone: (
    frameIndex: number,
    totalFrames: number,
    timestampSec: number,
  ) => void,
  onWarning: (message: string) => void,
): Promise<GridResult> => {
  const duration = Math.max(1, meta.duration || 1);
  const vrActive = opts.vrMode !== "disabled";

  // Resolve header height if enabled
  const { headerCanvas, headerHeight } = prepareHeader(opts, file, meta);

  // Get layout and slots (shifted automatically by headerHeight)
  const { frameSlots, canvasWidth, canvasHeight } = getGridLayout(
    opts,
    meta,
    headerHeight,
  );
  const totalCells = frameSlots.length;

  // Pick times automatically or from edited timestamps
  const times =
    opts.customTimestamps && opts.customTimestamps.length > 0
      ? resolveTimestamps(opts.customTimestamps, totalCells, duration)
      : calculateSampleTimes(totalCells, duration);

  // Setup <canvas> elements to capture frames
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  if (headerCanvas) {
    ctx.drawImage(headerCanvas, 0, 0);
  }

  // Setup a <video> element to capture frames
  const decoder = await setupVideoDecoder(file, meta, onWarning);
  const video = decoder.video;
  const videoCleanup = decoder.videoCleanup;
  let canNativelyPlay = decoder.canNativelyPlay;

  // FFmpeg batch results - lazily populated on first need.
  let ffmpegBitmaps: (ImageBitmap | null)[] | null = null;
  let ffmpegFailedFrames = 0;
  const ensureFFmpegBitmaps = async (): Promise<void> => {
    if (ffmpegBitmaps !== null) return;
    log(`  Switching to FFmpeg batch extraction for all ${totalCells} frames…`);
    ffmpegBitmaps = await extractFramesFFmpegBatch(
      file,
      times,
      isCancelled,
      (idx, _total, err) => {
        if (err) {
          // Re-throw abort errors immediately so they propagate to useProcessor
          // and clear the forceCancelCurrentRef flag. Without this, the error
          // is swallowed here, the flag stays true, and a re-queued file will
          // have isCancelled() return true on every frame.
          if (isAbortError(err)) {
            throw new Error(`FFmpeg operation aborted: ${err}`);
          }
          ffmpegFailedFrames++;
          onWarning(`FFmpeg frame ${idx + 1}/${totalCells} failed: ${err}`);
          if (ffmpegFailedFrames > 2) {
            throw new Error(
              "FFmpeg decoding failed repeatedly — likely OOM or unsupported codec.",
            );
          }
        }
      },
    );
  };

  // Frame loop
  for (let i = 0; i < times.length; i++) {
    if (isCancelled()) break;
    const tSec = times[i];
    const { x, y, cellW, cellH } = frameSlots[i];

    log(
      `  Frame ${i + 1}/${totalCells} — t=${tSec.toFixed(3)}s (${formatTime(tSec)}) from "${file.name}"`,
    );

    let frameDrawn = false;

    // Native path
    if (canNativelyPlay) {
      try {
        await seekVideo(video, tSec);
        if (vrActive) {
          const vw = video.videoWidth || meta.width;
          const vh = video.videoHeight || meta.height;
          const { sx, sy, sw, sh } = getVrCropRect(
            vw,
            vh,
            opts.vrMode as Exclude<VrMode, "disabled">,
          );
          ctx.drawImage(video, sx, sy, sw, sh, x, y, cellW, cellH);
        } else {
          ctx.drawImage(video, x, y, cellW, cellH);
        }
        frameDrawn = true;
      } catch (seekErr) {
        const msg =
          seekErr instanceof Error ? seekErr.message : String(seekErr);
        warn(`  Native seek failed at frame ${i + 1}: ${msg}`);
        onWarning(
          `Native seek failed at frame ${i + 1} (${msg}) — switching to FFmpeg`,
        );
        canNativelyPlay = false;
      }
    }

    // FFmpeg fallback path
    if (!canNativelyPlay) {
      try {
        await ensureFFmpegBitmaps();
        const bitmap = ffmpegBitmaps![i];
        if (bitmap) {
          if (vrActive) {
            const { sx, sy, sw, sh } = getVrCropRect(
              bitmap.width,
              bitmap.height,
              opts.vrMode as Exclude<VrMode, "disabled">,
            );
            ctx.drawImage(bitmap, sx, sy, sw, sh, x, y, cellW, cellH);
          } else {
            ctx.drawImage(bitmap, x, y, cellW, cellH);
          }
          bitmap.close();
          ffmpegBitmaps![i] = null;
          frameDrawn = true;
        } else {
          onWarning(
            `FFmpeg returned no image for frame ${i + 1} — cell left blank`,
          );
        }
      } catch (ffErr) {
        // Re-throw abort errors so they propagate to useProcessor which clears
        // the forceCancelCurrentRef flag. Without this, the flag stays true
        // and a re-queued file will have isCancelled() return true on every frame.
        if (isAbortError(ffErr)) {
          errlog(`  FFmpeg frame ${i + 1} aborted (propagating):`, ffErr);
          throw ffErr;
        }
        const msg = ffErr instanceof Error ? ffErr.message : String(ffErr);
        errlog(`  FFmpeg frame ${i + 1} error:`, msg);
        onWarning(`FFmpeg error at frame ${i + 1}: ${msg}`);
        if (isMemoryError(ffErr)) {
          onWarning(
            `⚠️ Out of memory at frame ${i + 1}. Try reducing output width, columns, or rows.`,
          );
        }
      }
    }

    // Error placeholder when both paths failed
    if (!frameDrawn) {
      drawErrorPlaceholder(ctx, x, y, cellW, cellH, opts.bgColor);
    }

    // Timecode overlay
    drawTimecodeOverlay(
      ctx,
      tSec,
      x,
      y,
      cellW,
      cellH,
      canvasWidth,
      opts.position,
      opts.bgColor,
      opts.textColor,
    );

    onFrameDone(i + 1, totalCells, tSec);
    // Avoid using requestAnimationFrame. unfocused windows/tab throttle it
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  videoCleanup();
  await cleanupFFmpeg();

  const outputName = `${file.name}.jpg`;
  const jpgBlob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? new Blob()), "image/jpeg", 0.95);
  });
  canvas.width = 0;
  canvas.height = 0;
  return { outputName, outputSize: jpgBlob.size, outputBlob: jpgBlob };
};
