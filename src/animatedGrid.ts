import { encodeAnimatedWebP, resetFFmpeg } from "./ffmpeg";
import type { GridOptions, GridResult } from "./grid";
import { seekVideo } from "./grid";
import { canNativelyPlay } from "./mediainfo";
import type { VideoMetadata, VrMode } from "./types";
import {
  calculateSampleTimes,
  createHeaderCanvas,
  drawErrorPlaceholder,
  drawTimecodeOverlay,
  getVrCropRect,
} from "./gridUtils";
import { errlog, log } from "./utils";

/** Animated grid options, extending the static grid options with animation parameters. */
export type AnimatedGridOptions = GridOptions & {
  /** Duration in seconds of each cell's animation clip. */
  animDuration: number;
  /** Output frame rate of the animated WebP. */
  animFps: number;
  /** WebP compression method (0-6). */
  webpMethod: number;
  /** WebP output quality (5-100). */
  webpQuality: number;
};

/**
 * Build an animated WebP contact sheet for a single video file.
 * Each grid cell plays a short clip sampled from its evenly-distributed timestamp.
 * Only files natively supported by the browser are accepted — FFmpeg fallback
 * is not available for frame extraction in animated mode.
 *
 * When `opts.vrMode` is not "disabled", the drawImage source rectangle is adjusted
 * to crop one eye from the stereo frame, identical to the static JPEG path.
 *
 * Progress is split into two phases:
 *   • Frame composition  — `onFrameDone` is called after each canvas frame is
 *     composed and exported as PNG, representing the bulk of the seek+draw work.
 *   • WebP encoding      — `onEncodeProgress` receives a 0–1 ratio as FFmpeg
 *     writes the PNG frames to its virtual FS (0–0.5) and then encodes the
 *     animated WebP (0.5–1.0).
 *
 * @param file              - The source video file.
 * @param meta              - Pre-read metadata (dimensions, duration, etc.).
 * @param opts              - Grid layout, appearance, and animation options.
 * @param isCancelled       - Polled before each animation frame; return true to abort.
 * @param onFrameDone       - Called after each composed animation frame with
 *                            (composedFrame, totalFrames).
 * @param onEncodeProgress  - Called with a 0–1 ratio during the FFmpeg encode phase.
 * @param onWarning         - Called for non-fatal issues to surface to the user.
 * @returns The output filename, byte size, and animated WebP blob.
 */
export const createAnimatedGridWebP = async (
  file: File,
  meta: VideoMetadata,
  opts: AnimatedGridOptions,
  isCancelled: () => boolean,
  onFrameDone: (composedFrame: number, totalFrames: number) => void,
  onEncodeProgress: (ratio: number) => void,
  onWarning: (message: string) => void,
): Promise<GridResult> => {
  if (!canNativelyPlay(file)) {
    throw new Error(
      "Animated WebP output requires native browser video decoding. FFmpeg fallback is unavailable in animated mode.",
    );
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const totalWidth = Math.max(240, opts.width);
  const cols = Math.max(1, opts.cols);
  const rows = Math.max(1, opts.rows);
  const spacing = Math.max(0, opts.spacing);
  const totalCells = cols * rows;
  const duration = Math.max(1, meta.duration || 1);
  const vrActive = opts.vrMode !== "disabled";

  const cellWidth = Math.floor((totalWidth - spacing * (cols - 1)) / cols);

  // Aspect ratio of a single cell, adjusted for VR crop mode.
  let cellAspect =
    meta.width > 0 && meta.height > 0 ? meta.height / meta.width : 9 / 16;
  if (vrActive) {
    if (opts.vrMode.startsWith("sbs")) cellAspect *= 2;
    else cellAspect /= 2;
  }

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

  const totalAnimFrames = Math.max(
    1,
    Math.ceil(opts.animDuration * opts.animFps),
  );
  const frameDuration = 1 / opts.animFps;
  const baseTimes = calculateSampleTimes(totalCells, duration);
  // Open a <video> element for native seeking.
  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = videoUrl;

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

  const videoCleanup = () => {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  };

  const composedFrames: Blob[] = [];

  try {
    for (let f = 0; f < totalAnimFrames; f++) {
      if (isCancelled()) break;

      // Clear the canvas
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      ctx.fillStyle = opts.bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      if (headerCanvas) {
        ctx.drawImage(headerCanvas, 0, 0);
      }

      for (let i = 0; i < totalCells; i++) {
        const tSec = Math.min(
          baseTimes[i] + f * frameDuration,
          duration - 0.001,
        );
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (cellWidth + spacing);
        const y = headerHeight + row * (cellHeight + spacing);

        log(
          `  [AnimWebP] anim frame ${f + 1}/${totalAnimFrames}, cell ${i + 1}/${totalCells} @ t=${tSec.toFixed(3)}s`,
        );

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
        } catch (seekErr) {
          const msg =
            seekErr instanceof Error ? seekErr.message : String(seekErr);
          errlog(
            `  [AnimWebP] seek failed — anim frame ${f + 1}, cell ${i + 1}:`,
            msg,
          );
          onWarning(
            `Seek failed at animation frame ${f + 1}, cell ${i + 1}: ${msg}`,
          );
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
      }

      const frameBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png");
      });
      composedFrames.push(frameBlob);
      canvas.width = 0;
      canvas.height = 0;

      onFrameDone(f + 1, totalAnimFrames);
      // Avoid using requestAnimationFrame. unfocused windows/tab throttle it
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  } finally {
    videoCleanup();
  }

  if (isCancelled() || composedFrames.length === 0) {
    throw new Error(
      "Processing was cancelled before any frames were composed.",
    );
  }

  log(
    `  [AnimWebP] Compositing done (${composedFrames.length} frames). Starting FFmpeg WebP encode…`,
  );
  // Signal that the encode phase is starting (ratio = 0).
  onEncodeProgress(0);
  // Encode via FFmpeg, forwarding real-time progress, then release WASM.
  const webpBlob = await encodeAnimatedWebP(
    composedFrames,
    opts.animFps,
    opts.webpQuality,
    opts.webpMethod,
    onEncodeProgress,
  ).finally(() => {
    resetFFmpeg();
  });

  const outputName = `${file.name}.webp`;
  return { outputName, outputSize: webpBlob.size, outputBlob: webpBlob };
};
