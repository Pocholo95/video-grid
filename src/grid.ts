import {
  HEADER_HEIGHT,
  HEADER_LINE_SPACING,
  HEADER_PADDING_LEFT,
  HEADER_TEXT_SIZE,
  SEEK_TIMEOUT_MS,
} from "./constants";
import {
  cleanupFFmpeg,
  extractFramesFFmpegBatch,
  isMemoryError,
  resetFFmpeg,
} from "./ffmpeg";
import type { Position, VideoMetadata } from "./types";
import { errlog, formatTime, humanSize, log, warn } from "./utils";

// Types

export type GridOptions = {
  width: number;
  cols: number;
  rows: number;
  spacing: number;
  position: Position;
  header: boolean;
  bgColor: string;
  textColor: string;
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

  const cellWidth = Math.floor((totalWidth - spacing * (cols - 1)) / cols);
  const aspect =
    meta.width > 0 && meta.height > 0 ? meta.height / meta.width : 9 / 16;
  const cellHeight = Math.max(1, Math.floor(cellWidth * aspect));

  const headerHeight = opts.header ? HEADER_HEIGHT : 0;
  const canvasWidth = cols * cellWidth + spacing * (cols - 1);
  const canvasHeight = headerHeight + rows * cellHeight + spacing * (rows - 1);

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Header
  if (opts.header) {
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, canvasWidth, headerHeight);
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

  // Sample timestamps - distributed evenly with a small margin at each end.
  const margin = Math.max(0.5, duration * 0.02);
  const usable = Math.max(duration - 2 * margin, 0.1);
  const times = Array.from({ length: total }, (_, i) =>
    Math.min(Math.max(0, margin + usable * ((i + 0.5) / total)), duration),
  );

  // Timecode position map
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
        ctx.drawImage(video, x, y, cellWidth, cellHeight);
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
          ctx.drawImage(bitmap, x, y, cellWidth, cellHeight);
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
      ctx.fillStyle = opts.bgColor;
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.fillStyle = "#555";
      ctx.font = "18px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FAILED", x + cellWidth / 2, y + cellHeight / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // Timecode overlay
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

    onFrameDone(i + 1, total, tSec);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
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
