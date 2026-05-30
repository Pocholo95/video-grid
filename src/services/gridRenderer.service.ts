/**
 * GridRenderer Service - encapsulates all grid rendering logic.
 *
 * Depends on IFFmpegService for frame extraction and WebP encoding.
 * Uses gridUtils for layout, headers, VR cropping, and canvas operations.
 */

import type { IFFmpegService, IGridRenderer } from "../types/service";
import type {
  StaticGridRenderOptions,
  AnimatedGridRenderOptions,
  GridRenderOutput,
  StaticCellCallback,
  AnimatedCellCallback,
  EncodeProgressCallback,
  WarningCallback,
} from "../types/service";
import type { VideoMetadata, VrMode } from "../types";
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
} from "../gridUtils";
import { errlog, formatTime, log, warn } from "../utils";
import { isAbortError, isMemoryError } from "./ffmpeg.service";
import { JPEG_QUALITY } from "@/constants";

/** - GridRenderer Implementation */

export class GridRenderer implements IGridRenderer {
  private readonly ffmpeg: IFFmpegService;

  /**
   * Cache to avoid re-uploading the same video file to FFmpeg's virtual
   * filesystem for every frame extraction.
   */
  private _inputFileCache: { key: string } | null = null;

  public constructor(ffmpegService: IFFmpegService) {
    this.ffmpeg = ffmpegService;
  }

  /** - Static JPEG Grid */

  public async renderStaticGrid(
    file: File,
    meta: VideoMetadata,
    opts: StaticGridRenderOptions,
    isCancelled: () => boolean,
    onCellDone: StaticCellCallback,
    onWarning: WarningCallback,
  ): Promise<GridRenderOutput> {
    const duration = Math.max(1, meta.duration || 1);
    const vrActive = opts.vrMode !== "disabled";

    const { headerCanvas, headerHeight } = prepareHeader(opts, file, meta);

    const layoutOpts = {
      width: opts.width,
      cols: opts.cols,
      rows: opts.rows,
      spacing: opts.spacing,
      gridTemplate: opts.gridTemplate,
      vrMode: opts.vrMode,
    };

    const { cellSlots, canvasWidth, canvasHeight } = getGridLayout(
      layoutOpts,
      meta,
      headerHeight,
    );
    const totalCells = cellSlots.length;

    const times =
      opts.customTimestamps && opts.customTimestamps.length > 0
        ? resolveTimestamps(opts.customTimestamps, totalCells, duration)
        : calculateSampleTimes(totalCells, duration);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    if (headerCanvas) {
      ctx.drawImage(headerCanvas, 0, 0);
    }

    const decoder = await setupVideoDecoder(file, meta, onWarning);
    const video = decoder.video;
    const videoCleanup = decoder.videoCleanup;
    let canNativelyPlay = decoder.canNativelyPlay;

    let ffmpegFailedFrames = 0;
    const extractOneFFmpegFrame = async (
      index: number,
      timestamp: number,
      targetW: number,
      targetH: number,
    ): Promise<ImageBitmap | null> => {
      log(
        `  Switching to FFmpeg frame-by-frame extraction ` +
          `for cell ${index + 1}/${totalCells}…`,
      );
      const bitmap = await this.extractFrameViaFFmpeg(
        file,
        timestamp,
        isCancelled,
        targetW,
        targetH,
      );
      if (!bitmap) {
        ffmpegFailedFrames++;
        onWarning(`FFmpeg frame ${index + 1}/${totalCells} failed to decode`);
        if (ffmpegFailedFrames > 2) {
          throw new Error(
            "FFmpeg decoding failed repeatedly — " +
              "likely OOM or unsupported codec.",
          );
        }
      }
      return bitmap;
    };

    for (let i = 0; i < times.length; i++) {
      if (isCancelled()) {
        throw new DOMException("Processing cancelled", "AbortError");
      }
      const tSec = times[i];
      const { x, y, cellW, cellH } = cellSlots[i];

      log(
        `  Cell ${i + 1}/${totalCells} — ` +
          `t=${tSec.toFixed(3)}s (${formatTime(tSec)}) ` +
          `from "${file.name}"`,
      );

      let cellDrawn = false;

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
          cellDrawn = true;
        } catch (seekErr) {
          const msg =
            seekErr instanceof Error ? seekErr.message : String(seekErr);
          warn(`  Native seek failed at cell ${i + 1}: ${msg}`);
          onWarning(
            `Native seek failed at cell ${i + 1} (${msg}) ` +
              `— switching to FFmpeg`,
          );
          canNativelyPlay = false;
        }
      }

      if (!canNativelyPlay) {
        try {
          const bitmap = await extractOneFFmpegFrame(i, tSec, cellW, cellH);
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
            cellDrawn = true;
          } else {
            onWarning(
              `FFmpeg returned no image for cell ${i + 1} ` +
                `— cell left blank`,
            );
          }
        } catch (ffErr) {
          if (isAbortError(ffErr)) {
            errlog(`  FFmpeg cell ${i + 1} aborted (propagating):`, ffErr);
            throw ffErr;
          }
          const msg = ffErr instanceof Error ? ffErr.message : String(ffErr);
          errlog(`  FFmpeg cell ${i + 1} error:`, msg);
          onWarning(`FFmpeg error at cell ${i + 1}: ${msg}`);
          if (isMemoryError(ffErr)) {
            onWarning(
              `Out of memory at cell ${i + 1}. ` +
                `Try reducing output width, columns, or rows.`,
            );
          }
        }
      }

      if (!cellDrawn) {
        drawErrorPlaceholder(ctx, x, y, cellW, cellH, opts.bgColor);
      }

      drawTimecodeOverlay(
        ctx,
        tSec,
        x,
        y,
        cellW,
        cellH,
        canvasWidth,
        opts.tcPosition,
        opts.bgColor,
        opts.textColor,
        opts.fontFamily,
        opts.tcFontSizeAuto,
        opts.tcFontSize,
      );

      onCellDone(i + 1, totalCells, tSec);
      await new Promise<void>((r) => setTimeout(r, 0));
    }

    videoCleanup();
    await this.ffmpeg.reset();

    const outputName = `${file.name}.jpg`;
    const jpgBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (b) => resolve(b ?? new Blob()),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
    canvas.width = 0;
    canvas.height = 0;
    return { outputName, outputSize: jpgBlob.size, outputBlob: jpgBlob };
  }

  /** - Animated WebP Grid */

  public async renderAnimatedGrid(
    file: File,
    meta: VideoMetadata,
    opts: AnimatedGridRenderOptions,
    isCancelled: () => boolean,
    onCellDone: AnimatedCellCallback,
    onEncodeProgress: EncodeProgressCallback,
    onWarning: WarningCallback,
  ): Promise<GridRenderOutput> {
    const duration = Math.max(1, meta.duration || 1);
    const vrActive = opts.vrMode !== "disabled";

    const { headerCanvas, headerHeight } = prepareHeader(opts, file, meta);

    const layoutOpts = {
      width: opts.width,
      cols: opts.cols,
      rows: opts.rows,
      spacing: opts.spacing,
      gridTemplate: opts.gridTemplate,
      vrMode: opts.vrMode,
    };

    const { cellSlots, canvasWidth, canvasHeight } = getGridLayout(
      layoutOpts,
      meta,
      headerHeight,
    );
    const totalCells = cellSlots.length;

    const totalAnimFrames = Math.max(
      1,
      Math.ceil(opts.animDuration * opts.animFps),
    );
    const frameDuration = 1 / opts.animFps;

    const baseTimes =
      opts.customTimestamps && opts.customTimestamps.length > 0
        ? resolveTimestamps(opts.customTimestamps, totalCells, duration)
        : calculateSampleTimes(totalCells, duration);

    const decoder = await setupVideoDecoder(file, meta, onWarning);
    const video = decoder.video;
    const videoCleanup = decoder.videoCleanup;

    if (!decoder.canNativelyPlay) {
      videoCleanup();
      throw new Error(
        "Animated WebP mode requires native browser video support. " +
          "This format is not natively decodable — " +
          "FFmpeg fallback is unavailable for animated output. " +
          "Disable animated mode to use the FFmpeg fallback " +
          "for static JPEG generation.",
      );
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    const frameNames: string[] = [];
    let framesWritten = 0;

    try {
      for (let f = 0; f < totalAnimFrames; f++) {
        if (isCancelled()) {
          throw new DOMException("Processing cancelled", "AbortError");
        }

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
          const { x, y, cellW, cellH } = cellSlots[i];

          log(
            `  [AnimWebP] Anim frame ${f + 1}/${totalAnimFrames}, ` +
              `cell ${i + 1}/${totalCells} @ t=${formatTime(tSec)}s`,
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
              ctx.drawImage(video, sx, sy, sw, sh, x, y, cellW, cellH);
            } else {
              ctx.drawImage(video, x, y, cellW, cellH);
            }
          } catch (seekErr) {
            const msg =
              seekErr instanceof Error ? seekErr.message : String(seekErr);
            errlog(
              `  [AnimWebP] seek failed — ` +
                `anim frame ${f + 1}, cell ${i + 1}:`,
              msg,
            );
            onWarning(
              `Seek failed at animation frame ${f + 1}, ` +
                `cell ${i + 1}: ${msg}`,
            );
            drawErrorPlaceholder(ctx, x, y, cellW, cellH, opts.bgColor);
          }

          drawTimecodeOverlay(
            ctx,
            tSec,
            x,
            y,
            cellW,
            cellH,
            canvasWidth,
            opts.tcPosition,
            opts.bgColor,
            opts.textColor,
            opts.fontFamily,
            opts.tcFontSizeAuto,
            opts.tcFontSize,
          );
        }

        const frameBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b ?? new Blob()), "image/png");
        });
        const name = `anim_${String(f).padStart(5, "0")}.png`;
        frameNames.push(name);
        await this.ffmpeg.writeData(
          name,
          new Uint8Array(await frameBlob.arrayBuffer()),
        );
        framesWritten++;

        canvas.width = 0;
        canvas.height = 0;

        onCellDone(f + 1, totalAnimFrames);
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    } finally {
      videoCleanup();
    }

    if (isCancelled() || framesWritten === 0) {
      for (const name of frameNames) {
        try {
          await this.ffmpeg.deleteFile(name);
        } catch {
          /* ignore cleanup errors */
        }
      }
      throw new DOMException(
        "Processing cancelled before any frames were composed.",
        "AbortError",
      );
    }

    log(
      `  [AnimWebP] Compositing done (${framesWritten} frames ` +
        `written to FS). Starting FFmpeg WebP encode…`,
    );

    onEncodeProgress(0);

    const webpBlob = await this.encodeAnimatedWebPFromFS(
      frameNames,
      framesWritten,
      opts.animFps,
      opts.webpQuality,
      opts.webpMethod,
      isCancelled,
      onEncodeProgress,
    );

    const outputName = `${file.name}.webp`;
    return { outputName, outputSize: webpBlob.size, outputBlob: webpBlob };
  }

  /** - Lifecycle */

  public async destroy(): Promise<void> {
    try {
      await this.ffmpeg.deleteFile("input.mp4");
    } catch {
      /* ignore */
    }
    this._inputFileCache = null;
  }

  /** - Private Helpers */

  private _getFileKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
  }

  private async _ensureInputFileInFs(file: File): Promise<void> {
    const fileKey = this._getFileKey(file);
    if (this._inputFileCache?.key === fileKey) return;
    await this.ffmpeg.writeData(
      "input.mp4",
      new Uint8Array(await file.arrayBuffer()),
    );
    this._inputFileCache = { key: fileKey };
  }

  private async extractFrameViaFFmpeg(
    file: File,
    timestamp: number,
    isCancelled: () => boolean,
    targetW: number,
    targetH: number,
  ): Promise<ImageBitmap | null> {
    if (isCancelled()) return null;

    await this.ffmpeg.setAbortController();
    await this._ensureInputFileInFs(file);

    const name = "frame_temp.jpg";
    const args: string[] = ["-ss", String(timestamp), "-i", "input.mp4"];

    if (targetW && targetH) {
      args.push("-vf", `scale=${targetW}:${targetH}`);
    }

    args.push(
      "-update",
      "1",
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-loglevel",
      "info",
      name,
    );

    log(
      `  [FFmpeg] Single frame at t=${timestamp.toFixed(3)}s` +
        (targetW ? ` -> ${targetW}x${targetH}` : ""),
    );

    try {
      await this.ffmpeg.exec(args);

      if (isCancelled()) {
        throw new DOMException("Processing cancelled", "AbortError");
      }

      const data = await this.ffmpeg.readData(name);
      const blob = new Blob([new Uint8Array(data)], {
        type: "image/jpeg",
      });
      const bitmap = await createImageBitmap(blob);

      try {
        await this.ffmpeg.deleteFile(name);
      } catch {
        /* ignore */
      }

      return bitmap;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errlog(`  [FFmpeg] Single frame extraction failed:`, msg);

      if (isAbortError(e)) {
        throw new Error(`FFmpeg operation aborted: ${msg}`);
      }

      try {
        await this.ffmpeg.deleteFile(name);
      } catch {
        /* ignore */
      }

      return null;
    }
  }

  private async encodeAnimatedWebPFromFS(
    frameNames: string[],
    totalFrames: number,
    fps: number,
    quality: number,
    method: number,
    isCancelled: () => boolean,
    onProgress: (ratio: number) => void,
  ): Promise<Blob> {
    if (isCancelled()) {
      log(
        `  [FFmpeg/AnimWebP] Cancel requested before ` +
          `encoding. Cleaning up.`,
      );
      for (const name of frameNames) {
        try {
          await this.ffmpeg.deleteFile(name);
        } catch {
          /* ignore */
        }
      }
      throw new Error("Encoding cancelled by user before encode phase.");
    }

    const outputName = "anim_output.webp";

    const firstFrame = frameNames[0];
    const padWidth = firstFrame.match(/_(\d+)\./)?.[1]?.length || 5;
    const prefix = firstFrame.substring(
      0,
      firstFrame.indexOf(`_${"0".repeat(padWidth)}`),
    );
    const ext = firstFrame.substring(firstFrame.lastIndexOf("."));
    const inputPattern = `${prefix}_%0${padWidth}d${ext}`;

    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress(Math.min(Math.max(progress, 0), 1));
    };
    this.ffmpeg.onProgress(progressHandler);

    try {
      log(
        `  [FFmpeg/AnimWebP] Encoding ${totalFrames} frames ` +
          `at ${fps} fps, quality=${quality}, method=${method}…`,
      );
      log(`  [FFmpeg/AnimWebP] Input pattern: ${inputPattern}`);

      await this.ffmpeg.exec([
        "-framerate",
        String(fps),
        "-i",
        inputPattern,
        "-c:v",
        "libwebp",
        "-lossless",
        "0",
        "-quality",
        String(quality),
        "-method",
        String(method),
        "-loop",
        "0",
        "-an",
        outputName,
      ]);

      const data = await this.ffmpeg.readData(outputName);
      log(`  [FFmpeg/AnimWebP] Encoding complete.`);
      onProgress(1.0);

      for (const name of frameNames) {
        try {
          await this.ffmpeg.deleteFile(name);
        } catch {
          /* ignore */
        }
      }
      try {
        await this.ffmpeg.deleteFile(outputName);
      } catch {
        /* ignore */
      }

      return new Blob([new Uint8Array(data)], { type: "image/webp" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errlog(`  [FFmpeg/AnimWebP] encode failed:`, msg);

      if (isAbortError(e)) {
        throw new Error(`FFmpeg operation aborted: ${msg}`);
      }

      throw new Error(`FFmpeg WebP encoding failed: ${msg}`);
    } finally {
      this.ffmpeg.offProgress(progressHandler);
    }
  }
}

/** - Factory */

export function createGridRenderer(
  ffmpegService: IFFmpegService,
): IGridRenderer {
  return new GridRenderer(ffmpegService);
}
