import { SEEK_TIMEOUT_MS } from "./constants";
import {
  cleanupFFmpeg,
  extractFramesFFmpegBatch,
  isMemoryError,
  resetFFmpeg,
} from "./ffmpeg";
import type { Position, VideoMetadata, VrMode } from "./types";
import { errlog, formatTime, log, warn } from "./utils";
import {
  calculateSampleTimes,
  createHeaderCanvas,
  drawErrorPlaceholder,
  drawTimecodeOverlay,
  getVrCropRect,
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
};

export type GridResult = {
  outputName: string;
  outputSize: number;
  outputBlob: Blob;
};

// Seek helper

/**
 * Seeks a video element to the given time and resolves when the seek completes.
 * Rejects with a timeout error if the seek takes longer than SEEK_TIMEOUT_MS.
 *
 * @param video - The HTMLVideoElement to seek.
 * @param t     - Target time in seconds.
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
 * Build a JPEG contact sheet for a single video file.
 * Tries native browser seeking first, falling back to FFmpeg WASM if that fails.
 *
 * When `opts.vrMode` is not "disabled", the source rectangle passed to drawImage
 * is adjusted to crop one eye from the stereo frame. This works on both the
 * native and FFmpeg fallback paths without any additional processing overhead.
 * A note is added to the header when it is visible.
 *
 * @param file         - The source video file.
 * @param meta         - Pre-read metadata (dimensions, duration, etc.).
 * @param opts         - Grid layout and appearance options.
 * @param isCancelled  - Polled before each frame; return true to abort cleanly.
 * @param onFrameDone  - Called after every frame to drive the progress bar.
 * @param onWarning    - Called for non-fatal issues to show to the user.
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
  const totalWidth = Math.max(240, opts.width);
  const cols = Math.max(1, opts.cols);
  const rows = Math.max(1, opts.rows);
  const spacing = Math.max(0, opts.spacing);
  const total = cols * rows;
  const duration = Math.max(1, meta.duration || 1);
  const vrActive = opts.vrMode !== "disabled";

  // Aspect ratio of a single cell. For SBS formats each eye is half the frame
  // width, so the eye itself has double the raw height/width ratio. For TB the
  // eye is half the frame height, halving that ratio.
  let cellAspect =
    meta.width > 0 && meta.height > 0 ? meta.height / meta.width : 9 / 16;
  if (vrActive) {
    if (opts.vrMode.startsWith("sbs")) cellAspect *= 2;
    else cellAspect /= 2;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const cellWidth = Math.floor((totalWidth - spacing * (cols - 1)) / cols);
  const cellHeight = Math.max(1, Math.floor(cellWidth * cellAspect));
  const canvasWidth = cols * cellWidth + spacing * (cols - 1);
  let headerCanvas: HTMLCanvasElement | undefined;
  let headerHeight = 0;
  if (opts.header) {
    headerCanvas = createHeaderCanvas(
      file,
      meta,
      opts.vrMode,
      canvasWidth,
      opts.bgColor,
      opts.textColor,
    );
    headerHeight = headerCanvas.height;
  }
  const canvasHeight = headerHeight + rows * cellHeight + spacing * (rows - 1);

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (headerCanvas) {
    ctx.drawImage(headerCanvas, 0, 0);
  }
  const times = calculateSampleTimes(total, duration);
  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = videoUrl;

  const videoCleanup = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  };

  let videoUsable = true;
  try {
    await new Promise<void>((resolve, reject) => {
      const tid = setTimeout(
        () => reject(new Error("Video open timeout")),
        15_000,
      );
      video.addEventListener(
        "loadedmetadata",
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
          reject(new Error("Video failed to open"));
        },
        { once: true },
      );
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warn(`Native video failed (${msg}), switching to FFmpeg`);
    onWarning(`Native decoder unavailable (${msg}) — using FFmpeg fallback`);
    videoUsable = false;
  }

  // FFmpeg batch results - lazily populated on first need.
  let ffmpegBitmaps: (ImageBitmap | null)[] | null = null;
  let ffmpegFailedFrames = 0;

  const ensureFFmpegBitmaps = async (): Promise<void> => {
    if (ffmpegBitmaps !== null) return;
    log(`  Switching to FFmpeg batch extraction for all ${total} frames…`);
    ffmpegBitmaps = await extractFramesFFmpegBatch(
      file,
      times,
      (idx, _total, err) => {
        if (err) {
          ffmpegFailedFrames++;
          onWarning(`FFmpeg frame ${idx + 1}/${total} failed: ${err}`);
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
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (cellWidth + spacing);
    const y = headerHeight + row * (cellHeight + spacing);

    log(
      `  Frame ${i + 1}/${total} — t=${tSec.toFixed(3)}s (${formatTime(tSec)}) from "${file.name}"`,
    );

    let frameDrawn = false;

    // Native path
    if (videoUsable) {
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
          ctx.drawImage(video, sx, sy, sw, sh, x, y, cellWidth, cellHeight);
        } else {
          ctx.drawImage(video, x, y, cellWidth, cellHeight);
        }
        frameDrawn = true;
      } catch (seekErr) {
        const msg =
          seekErr instanceof Error ? seekErr.message : String(seekErr);
        warn(`  Native seek failed at frame ${i + 1}: ${msg}`);
        onWarning(
          `Native seek failed at frame ${i + 1} (${msg}) — switching to FFmpeg`,
        );
        videoUsable = false;
      }
    }

    // FFmpeg fallback path
    if (!videoUsable) {
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
            ctx.drawImage(bitmap, sx, sy, sw, sh, x, y, cellWidth, cellHeight);
          } else {
            ctx.drawImage(bitmap, x, y, cellWidth, cellHeight);
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
      drawErrorPlaceholder(ctx, x, y, cellWidth, cellHeight, opts.bgColor);
    }

    // Timecode overlay
    drawTimecodeOverlay(
      ctx,
      tSec,
      x,
      y,
      cellWidth,
      cellHeight,
      totalWidth,
      opts.position,
      opts.bgColor,
      opts.textColor,
    );

    onFrameDone(i + 1, total, tSec);
    // Avoid using requestAnimationFrame. unfocused windows/tab throttle it
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  videoCleanup();
  await cleanupFFmpeg();
  resetFFmpeg();

  const outputName = `${file.name}.jpg`;
  const jpgBlob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? new Blob()), "image/jpeg", 0.95);
  });

  canvas.width = 0;
  canvas.height = 0;

  return { outputName, outputSize: jpgBlob.size, outputBlob: jpgBlob };
};
