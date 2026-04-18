import {
  HEADER_HEIGHT,
  HEADER_LINE_SPACING,
  HEADER_PADDING_LEFT,
  HEADER_TEXT_SIZE,
} from "./constants";
import { encodeAnimatedWebP, resetFFmpeg } from "./ffmpeg";
import type { GridOptions, GridResult } from "./grid";
import { seekVideo } from "./grid";
import { canNativelyPlay } from "./mediainfo";
import type { Position, VideoMetadata } from "./types";
import { errlog, formatTime, humanSize, log } from "./utils";

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
      "Animated WebP output requires native browser video decoding. " +
        "This format is not supported — FFmpeg fallback is unavailable in animated mode.",
    );
  }

  const totalWidth = Math.max(240, opts.width);
  const cols = Math.max(1, opts.cols);
  const rows = Math.max(1, opts.rows);
  const spacing = Math.max(0, opts.spacing);
  const totalCells = cols * rows;
  const duration = Math.max(1, meta.duration || 1);

  const cellWidth = Math.floor((totalWidth - spacing * (cols - 1)) / cols);
  const aspect =
    meta.width > 0 && meta.height > 0 ? meta.height / meta.width : 9 / 16;
  const cellHeight = Math.max(1, Math.floor(cellWidth * aspect));
  const headerHeight = opts.header ? HEADER_HEIGHT : 0;
  const canvasWidth = cols * cellWidth + spacing * (cols - 1);
  const canvasHeight = headerHeight + rows * cellHeight + spacing * (rows - 1);

  const totalAnimFrames = Math.max(
    1,
    Math.ceil(opts.animDuration * opts.animFps),
  );
  const frameDuration = 1 / opts.animFps;

  // Base timestamp per cell, distributed evenly with a small margin at each end.
  const margin = Math.max(0.5, duration * 0.02);
  const usable = Math.max(duration - 2 * margin, 0.1);
  const baseTimes = Array.from({ length: totalCells }, (_, i) =>
    Math.min(Math.max(0, margin + usable * ((i + 0.5) / totalCells)), duration),
  );

  // Timecode position lookup.
  const posMap: Record<
    Exclude<Position, "disabled">,
    { x: "left" | "right"; y: "top" | "bottom" }
  > = {
    "top-left": { x: "left", y: "top" },
    "top-right": { x: "right", y: "top" },
    "bottom-left": { x: "left", y: "bottom" },
    "bottom-right": { x: "right", y: "bottom" },
  };

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

      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d")!;

      ctx.fillStyle = opts.bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Draw the header with static file info on every animation frame.
      if (opts.header) {
        ctx.fillStyle = opts.textColor;
        ctx.font = `${HEADER_TEXT_SIZE}px system-ui, Arial, sans-serif`;
        ctx.textBaseline = "top";
        const infoLines = [
          `Filename: ${file.name}`,
          `Size: ${humanSize(file.size)}`,
          `Resolution: ${meta.width > 0 ? `${meta.width}x${meta.height}` : "Unknown"}`,
          `Duration: ${formatTime(meta.duration)}`,
          `Bitrate: ${meta.bitrate ? `${Math.round(meta.bitrate / 1000)} kbps` : "Unknown"}`,
        ];
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
          yPos += HEADER_LINE_SPACING;
        }
        ctx.textBaseline = "alphabetic";
      }

      // Draw each cell at its timestamp offset for this animation frame.
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
          ctx.drawImage(video, x, y, cellWidth, cellHeight);
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
          // Draw a placeholder on failure.
          ctx.fillStyle = "#444";
          ctx.fillRect(x, y, cellWidth, cellHeight);
          ctx.fillStyle = "#888";
          ctx.font = "16px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("FAILED", x + cellWidth / 2, y + cellHeight / 2);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
        }

        // Timecode overlay showing the current seek position.
        if (opts.position !== "disabled") {
          const pos = posMap[opts.position];
          const label = formatTime(tSec);
          const tcFontSz = Math.max(11, Math.round(totalWidth * 0.012));
          ctx.font = `${tcFontSz}px system-ui, Arial, sans-serif`;
          ctx.textBaseline = "top";
          const textW = ctx.measureText(label).width;
          const pad = 6;
          const bgW = textW + pad * 2;
          const bgH = tcFontSz + pad * 2;
          const bgX = pos.x === "left" ? x + pad : x + cellWidth - bgW - pad;
          const bgY = pos.y === "top" ? y + pad : y + cellHeight - bgH - pad;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(bgX, bgY, bgW, bgH);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, bgX + pad, bgY + pad);
          ctx.textBaseline = "alphabetic";
        }
      }

      // Export the composed frame as PNG and release the canvas immediately.
      const frameBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png");
      });
      composedFrames.push(frameBlob);
      canvas.width = 0;
      canvas.height = 0;

      onFrameDone(f + 1, totalAnimFrames);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
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
