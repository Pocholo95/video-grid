import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { FFMPEG_EXEC_TIMEOUT_MS } from "./constants";
import type { FfmpegMemoryStats } from "./types";
import { errlog, humanSize, log } from "./utils";

// Extend Performance interface for Chrome/Edge memory extension
interface PerformanceMemory {
  jsHeapSizeLimit: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

const hasPerformanceMemory =
  typeof performance !== "undefined" && "memory" in performance;

/**
 * Read memory stats from performance.memory (Chrome/Edge) or return null.
 */
function readPerformanceMemory(): FfmpegMemoryStats | null {
  if (!hasPerformanceMemory) return null;
  const mem = (performance as unknown as { memory: PerformanceMemory }).memory;
  return {
    usedMB: Math.round(mem.usedJSHeapSize / 1048576),
    totalMB: Math.round(mem.totalJSHeapSize / 1048576),
    limitMB: Math.round(mem.jsHeapSizeLimit / 1048576),
    accurate: true,
  };
}

/**
 * Estimate memory pressure when performance.memory is unavailable.
 * Based on input file size + frames processed + overhead.
 */
function estimateMemory(
  fileSizeBytes: number,
  framesProcessed: number,
  totalFrames: number,
): FfmpegMemoryStats {
  // WASM needs to hold the input file in its virtual FS
  const fileMB = fileSizeBytes / 1048576;

  // Each decoded frame is roughly (width * height * 3) for YUV420 or RGB
  // We estimate ~2MB per frame as a safe upper bound for typical 1080p content
  const frameOverheadMB = framesProcessed * 2;

  // FFmpeg WASM base overhead (runtime, buffers, etc)
  const baseOverheadMB = 30;

  // Encoding phase uses additional memory proportional to remaining frames
  const encodeOverheadMB =
    totalFrames > 0 ? (framesProcessed / totalFrames) * fileMB * 0.5 : 0;

  const estimatedUsed =
    baseOverheadMB + fileMB + frameOverheadMB + encodeOverheadMB;
  // Total heap is typically 1.5-2x the used amount for WASM
  const estimatedTotal = estimatedUsed * 1.5;
  // Browser heap limits are typically 2GB for single tabs
  const estimatedLimit = 2048;

  return {
    usedMB: Math.round(estimatedUsed),
    totalMB: Math.round(estimatedTotal),
    limitMB: estimatedLimit,
    accurate: false,
  };
}

// Singleton instance and load promise, shared across the module.
let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let currentFFmpegInputKey: string | null = null;

/** Tracks whether an FFmpeg WASM operation is currently in progress. */
let isFFmpegBusy = false;

/**
 * Global flag indicating FFmpeg is in an unrecoverable broken state.
 * When true, getFFmpeg() will refuse to return an instance until resetFFmpeg()
 * is called and a fresh load succeeds.
 */
let isFFmpegBroken = false;

/**
 * Per-task AbortController used to cancel in-flight FFmpeg operations
 * immediately when a force cancel occurs. All FFmpeg calls (exec, writeFile,
 * readFile, deleteFile) receive this signal so they reject with an AbortError
 * before terminate() is called, avoiding dangling promises.
 */
let taskAbortController: AbortController | null = null;

/**
 * Per-task FFmpeg log buffer. Keyed by TaskItem id.
 * Captures all FFmpeg WASM log output so the UI can display it in a
 * collapsible panel when FFmpeg is used.
 */
const taskLogs: Record<string, string[]> = {};
let currentLogTaskId: string | null = null;

/**
 * React-style subscriber callback invoked whenever a new log line is appended
 * to the current task's buffer. The processor hook sets this so it can
 * trigger a React re-render with the live log array.
 */
let onLogsChanged: ((id: string, logs: string[]) => void) | null = null;

/** Register a callback that fires every time FFmpeg logs are updated. */
export const setOnLogsChanged = (
  cb: ((id: string, logs: string[]) => void) | null,
) => {
  onLogsChanged = cb;
};

/**
 * React-style subscriber callback invoked whenever memory stats change while
 * FFmpeg is processing. The processor hook sets this so it can trigger a
 * React re-render with live memory data.
 */
let onMemoryChanged: ((id: string, stats: FfmpegMemoryStats) => void) | null =
  null;

/** Register a callback that fires whenever memory stats are updated. */
export const setOnMemoryChanged = (
  cb: ((id: string, stats: FfmpegMemoryStats) => void) | null,
) => {
  onMemoryChanged = cb;
};

/** Current memory stats snapshot (or null if not tracking). */
export const getMemoryStats = (): FfmpegMemoryStats | null =>
  currentMemoryStats;

/**
 * Memory polling interval ID. Started when FFmpeg becomes busy, stopped when idle.
 */
let memoryPollInterval: ReturnType<typeof setInterval> | null = null;
let currentMemoryStats: FfmpegMemoryStats | null = null;

/**
 * Track the current file being processed for memory estimation fallback.
 */
let currentFileBytes: number = 0;
let currentFramesProcessed: number = 0;
let currentTotalFrames: number = 0;

/**
 * Set the current file context for memory estimation. Call this when starting
 * processing of a new file so the fallback estimator has accurate input.
 */
export const setCurrentFileContext = (
  fileSizeBytes: number,
  totalFrames: number,
): void => {
  currentFileBytes = fileSizeBytes;
  currentTotalFrames = totalFrames;
  currentFramesProcessed = 0;
};

/**
 * Increment the frames-processed counter. Call after each frame is extracted.
 */
export const incrementFramesProcessed = (): void => {
  currentFramesProcessed++;
};

/**
 * Start periodic memory polling. Reads performance.memory (Chrome/Edge) or
 * falls back to estimation based on file size + frames processed.
 */
export function startMemoryPolling(): void {
  if (memoryPollInterval) return; // already running
  memoryPollInterval = setInterval(() => {
    const stats =
      readPerformanceMemory() ??
      estimateMemory(
        currentFileBytes,
        currentFramesProcessed,
        currentTotalFrames,
      );
    currentMemoryStats = stats;
    if (currentLogTaskId && onMemoryChanged) {
      onMemoryChanged(currentLogTaskId, stats);
    }
  }, 500);
}

/** Stop the memory polling interval and clear stats. */
export function stopMemoryPolling(): void {
  if (memoryPollInterval) {
    clearInterval(memoryPollInterval);
    memoryPollInterval = null;
  }
  currentMemoryStats = null;
}

/** Set the current task id so FFmpeg logs are routed to the right TaskItem. */
export const setCurrentLogTaskId = (id: string | null) => {
  currentLogTaskId = id;
  if (id) taskLogs[id] = [];
};

/**
 * Create a fresh AbortController for the current task. Call this at the
 * start of processing each file so all FFmpeg operations can be cancelled.
 */
export const setTaskAbortController = (): AbortController => {
  taskAbortController = new AbortController();
  return taskAbortController;
};

/**
 * Return the current task's AbortSignal (or undefined if no task is active).
 * Pass this to every FFmpeg method call to enable cancellation.
 */
export const getCurrentAbortSignal = (): AbortSignal | undefined =>
  taskAbortController?.signal;

/** Get the accumulated FFmpeg logs for a task id (consumes the buffer). */
export const getAndClearTaskLogs = (id: string): string[] => {
  const logs = taskLogs[id] || [];
  delete taskLogs[id];
  return logs;
};

/** Get the current FFmpeg logs for a task id (does NOT consume). */
export const getTaskLogs = (id: string): string[] => {
  return taskLogs[id] || [];
};

/** Append a log line to the current task's buffer. */
function appendTaskLog(line: string) {
  if (currentLogTaskId) {
    if (!taskLogs[currentLogTaskId]) taskLogs[currentLogTaskId] = [];
    taskLogs[currentLogTaskId].push(line);
    // Notify subscriber so the UI can update live.
    onLogsChanged?.(currentLogTaskId, taskLogs[currentLogTaskId]);
  }
}

/** Returns true if an FFmpeg WASM operation is currently in progress. */
export const getIsFFmpegBusy = (): boolean => isFFmpegBusy;

/** Returns true if FFmpeg is in an unrecoverable broken state. */
export const getIsFFmpegBroken = (): boolean => isFFmpegBroken;

/**
 * Verify that an FFmpeg instance is actually functional by running a trivial
 * command. Returns true if the instance responded, false otherwise.
 */
async function healthCheckFFmpeg(ff: FFmpeg): Promise<boolean> {
  try {
    await ff.exec(["-version"]);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errlog("[FFmpeg] Health check failed:", msg);
    return false;
  }
}

/** Returns the shared FFmpeg instance, initialising it on first call. */
const getFFmpeg = async (): Promise<FFmpeg> => {
  if (isFFmpegBroken) {
    throw new Error(
      "FFmpeg is in a broken state and cannot be used. " +
        "Please refresh the page or skip FFmpeg-dependent files.",
    );
  }
  if (ffmpeg) return ffmpeg;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const inst = new FFmpeg();
      inst.on("log", (logData) => {
        appendTaskLog(`[FFmpeg WASM] ${logData.message}`);
        isFFmpegBusy = true;
      });
      await inst.load();
      ffmpeg = inst;
      return inst;
    })();
  }
  try {
    return await ffmpegLoadPromise;
  } catch (e) {
    // The load promise rejected (e.g., WASM failed to load). Clear it so the
    // next call creates a fresh instance instead of reusing a broken one.
    const msg = e instanceof Error ? e.message : String(e);
    errlog(
      "[FFmpeg] getFFmpeg: load promise rejected, clearing for retry:",
      msg,
    );
    ffmpegLoadPromise = null;
    ffmpeg = null;
    throw new Error(`FFmpeg load failed: ${msg}`);
  }
};

/** Terminates the FFmpeg instance and clears all cached state. */
export const resetFFmpeg = (): void => {
  isFFmpegBusy = false;

  // First, abort any in-flight operations so their promises reject cleanly
  // with an AbortError instead of dying silently when the worker is killed.
  if (taskAbortController) {
    try {
      taskAbortController.abort();
    } catch {
      /* ignore */
    }
    taskAbortController = null;
  }

  if (ffmpeg) {
    try {
      ffmpeg.terminate();
    } catch {
      /* already dead */
    }
    ffmpeg = null;
  }
  ffmpegLoadPromise = null;
  currentFFmpegInputKey = null;
};

/** Re-initializes the FFmpeg instance after it has been terminated. */
export const reinitFFmpeg = async (): Promise<FFmpeg> => {
  log("[FFmpeg] Re-initializing FFmpeg WASM instance…");
  // Clear stale state before attempting to load
  ffmpeg = null;
  ffmpegLoadPromise = null;
  isFFmpegBroken = false;
  try {
    const inst = new FFmpeg();
    inst.on("log", (logData) => {
      appendTaskLog(`[FFmpeg WASM] ${logData.message}`);
      isFFmpegBusy = true;
    });
    await inst.load();

    // Health check: verify the instance is actually functional
    if (!(await healthCheckFFmpeg(inst))) {
      throw new Error(
        "FFmpeg loaded but health check failed — instance is non-functional.",
      );
    }

    ffmpeg = inst;
    ffmpegLoadPromise = Promise.resolve(inst);
    log("[FFmpeg] Instance re-initialized successfully (health check passed).");
    return inst;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errlog("[FFmpeg] Re-initialization failed:", msg);
    // Ensure stale state is cleared so the next getFFmpeg() call retries
    ffmpeg = null;
    ffmpegLoadPromise = null;
    // Mark as broken so subsequent files show a clear error instead of
    // silently attempting (and failing) FFmpeg operations.
    isFFmpegBroken = true;
    throw new Error(`FFmpeg re-initialization failed: ${msg}`);
  }
};

/**
 * Wraps a promise with a timeout. If the promise does not resolve within
 * the given milliseconds, a descriptive TimeoutError is thrown.
 *
 * @param promise - The async operation to execute.
 * @param ms - Maximum allowed time in milliseconds.
 * @param label - Human-readable label for the operation (used in error message).
 */
export const withTimeout = (
  promise: Promise<unknown>,
  ms: number,
  label: string,
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      abortController.abort();
      reject(
        new Error(
          `[FFmpeg Timeout] "${label}" did not complete within ${ms}ms. ` +
            "The operation may be stuck. Check the console for details.",
        ),
      );
    }, ms);
    // Use an AbortController so we can signal cancellation (best-effort).
    const abortController = new AbortController();
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });

/**
 * Ensures the given file is written to the FFmpeg virtual filesystem as
 * `input.mp4`, reusing the cached entry when the file identity matches.
 *
 * @param file - The video file to prepare.
 * @returns The ready-to-use FFmpeg instance.
 */
export const prepareFFmpegInput = async (file: File): Promise<FFmpeg> => {
  const ff = await getFFmpeg();
  const signal = getCurrentAbortSignal();
  const key = `${file.name}:${file.size}:${file.lastModified}`;
  if (currentFFmpegInputKey !== key) {
    try {
      await ff.deleteFile("input.mp4", { signal });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "AbortError" && !msg.includes("abort")) {
        errlog("  [FFmpeg] deleteFile(input.mp4) cleanup failed:", msg);
      }
    }
    log(
      `  [FFmpeg] Writing "${file.name}" (${humanSize(file.size)}) into FFmpeg FS…`,
    );
    isFFmpegBusy = true;
    try {
      await withTimeout(
        ff.writeFile("input.mp4", await fetchFile(file), { signal }),
        FFMPEG_EXEC_TIMEOUT_MS,
        `writeFile("${file.name}")`,
      );
      currentFFmpegInputKey = key;
      log("  [FFmpeg] FS write complete.");
    } catch (e) {
      isFFmpegBusy = false;
      const msg = e instanceof Error ? e.message : String(e);
      errlog(`  [FFmpeg] writeFile failed:`, msg);
      throw new Error(`Failed to write file to FFmpeg FS: ${msg}`);
    }
  } else {
    log("  [FFmpeg] Reusing cached FFmpeg FS entry.");
  }
  return ff;
};

/** Removes `input.mp4` from the FFmpeg virtual filesystem and clears the cache key. */
export const cleanupFFmpeg = async (): Promise<void> => {
  if (!ffmpeg) return;
  const signal = getCurrentAbortSignal();
  try {
    await ffmpeg.deleteFile("input.mp4", { signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "AbortError" && !msg.includes("abort")) {
      errlog("  [FFmpeg] cleanup deleteFile failed:", msg);
    }
  }
  currentFFmpegInputKey = null;
};

/**
 * Returns true if the error looks like a WASM out-of-memory or abort condition.
 *
 * @param e - The caught error value.
 */
export const isMemoryError = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message : String(e);
  // Exclude abort/cancel errors from memory detection so that a force-cancel
  // does not trigger a misleading "Out of memory" warning in grid.ts.
  if (isAbortError(e)) return false;
  return /out.of.bounds|memory|unreachable|OOM|heap/i.test(msg);
};

/**
 * Returns true if the error is an abort/cancellation error (not a fatal error).
 */
export const isAbortError = (e: unknown): boolean => {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /abort/i.test(msg);
};

/**
 * Extracts a batch of frames from a video file using FFmpeg WASM.
 * Each frame is decoded at the given timestamp and returned as an ImageBitmap.
 * Failed frames are returned as null and reported via `onFrameExtracted`.
 *
 * @param file             - The source video file.
 * @param times            - Array of timestamps (seconds) at which to extract frames.
 * @param isCancelled      - Optional pollable callback; if it returns true, extraction aborts early.
 * @param onFrameExtracted - Optional callback invoked after each attempt with the
 *                           frame index, total count, and an error string if it failed.
 * @returns An array of ImageBitmap (or null for failed frames) in the same order as `times`.
 */
export const extractFramesFFmpegBatch = async (
  file: File,
  times: number[],
  isCancelled?: () => boolean,
  onFrameExtracted?: (index: number, total: number, error?: string) => void,
): Promise<(ImageBitmap | null)[]> => {
  const ff = await prepareFFmpegInput(file);
  const signal = getCurrentAbortSignal();
  const results: (ImageBitmap | null)[] = new Array(times.length).fill(null);
  let totalFailed = 0;

  for (let i = 0; i < times.length; i++) {
    // Check cancellation before each frame extraction
    if (isCancelled?.()) {
      log(
        `  [FFmpeg] Cancel requested before frame ${i + 1}/${times.length}. Stopping batch.`,
      );
      break;
    }

    const t = times[i];
    const name = `frame_${i}.jpg`;
    log(`  [FFmpeg] Frame ${i + 1}/${times.length} at t=${t.toFixed(3)}s`);
    isFFmpegBusy = true;
    try {
      await withTimeout(
        ff.exec(
          [
            "-ss",
            String(t),
            "-i",
            "input.mp4",
            "-frames:v",
            "1",
            "-q:v",
            "1",
            "-loglevel",
            "info",
            name,
          ],
          undefined,
          { signal },
        ),
        FFMPEG_EXEC_TIMEOUT_MS,
        `frame extraction at t=${t.toFixed(3)}s`,
      );
      const data = await ff.readFile(name, undefined, { signal });
      const arrayBuffer = new Uint8Array(
        typeof data === "string" ? new TextEncoder().encode(data) : data,
      ).buffer;
      const blob = new Blob([arrayBuffer], { type: "image/jpeg" });
      results[i] = await createImageBitmap(blob);
      onFrameExtracted?.(i, times.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errlog(`  [FFmpeg] Frame ${i + 1} failed:`, msg);

      // If this is an abort error, propagate it immediately so the caller
      // knows processing was force-cancelled rather than just failing.
      if (isAbortError(e)) {
        throw new Error(`FFmpeg operation aborted: ${msg}`);
      }

      if (isMemoryError(e)) {
        errlog(
          `  [FFmpeg] This appears to be an OOM / abort condition. Consider reducing grid size or output resolution.`,
        );
      }
      totalFailed++;
      onFrameExtracted?.(i, times.length, msg);
    } finally {
      isFFmpegBusy = false;
      try {
        await ff.deleteFile(name, { signal });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!isAbortError(e)) {
          errlog(`  [FFmpeg] cleanup deleteFile(${name}) failed:`, msg);
        }
      }
    }
  }

  // If every frame failed, throw an error so the caller knows FFmpeg is broken
  // rather than silently returning an array of nulls.
  if (results.length > 0 && results.every((r) => r === null)) {
    const errMsg =
      `FFmpeg frame extraction failed for all ${results.length} frames ` +
      `(${totalFailed} failures). The file may be unsupported, corrupt, ` +
      "or FFmpeg may be in a broken state.";
    errlog("[FFmpeg]", errMsg);
    throw new Error(errMsg);
  }

  return results;
};

/**
 * Encodes a sequence of PNG Blob frames into an animated WebP using FFmpeg WASM.
 * Frames are written to the virtual filesystem, encoded, then cleaned up.
 * Requires the @ffmpeg/core build to include libwebp (standard builds do).
 *
 * Progress is reported in two phases via `onProgress`:
 *   0.0–0.5  Writing PNG frames to the FFmpeg virtual filesystem.
 *   0.5–1.0  FFmpeg libwebp encoding (driven by FFmpeg's built-in progress events).
 *
 * @param frames     - Array of PNG Blobs in display order.
 * @param fps        - Target frame rate for the animation.
 * @param quality    - WebP quality (0-100).
 * @param method     - WebP compression method (0-6).
 * @param isCancelled - Optional pollable callback; if it returns true, encoding aborts early.
 * @param onProgress - Optional callback receiving a 0–1 ratio as encoding proceeds.
 * @returns The encoded animated WebP as a Blob.
 */
export const encodeAnimatedWebP = async (
  frames: Blob[],
  fps: number,
  quality: number,
  method: number,
  isCancelled?: () => boolean,
  onProgress?: (ratio: number) => void,
): Promise<Blob> => {
  const ff = await getFFmpeg();
  const signal = getCurrentAbortSignal();
  const frameNames: string[] = [];

  log(`  [FFmpeg/AnimWebP] Writing ${frames.length} PNG frames to FFmpeg FS…`);
  for (let i = 0; i < frames.length; i++) {
    // Check cancellation during frame writing
    if (isCancelled?.()) {
      log(
        `  [FFmpeg/AnimWebP] Cancel requested during frame write. Cleaning up and aborting.`,
      );
      // Clean up already-written frames
      for (const writtenName of frameNames) {
        try {
          await ff.deleteFile(writtenName, { signal });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!isAbortError(e)) {
            errlog(
              `  [FFmpeg/AnimWebP] cleanup deleteFile(${writtenName}) failed:`,
              msg,
            );
          }
        }
      }
      isFFmpegBusy = false;
      throw new Error("Encoding cancelled by user during frame write phase.");
    }

    const name = `anim_${String(i).padStart(5, "0")}.png`;
    frameNames.push(name);
    const buf = await frames[i].arrayBuffer();
    isFFmpegBusy = true;
    try {
      await withTimeout(
        ff.writeFile(name, new Uint8Array(buf), { signal }),
        FFMPEG_EXEC_TIMEOUT_MS,
        `writeFile(anim_${String(i).padStart(5, "0")}.png)`,
      );
    } catch (e) {
      isFFmpegBusy = false;
      const msg = e instanceof Error ? e.message : String(e);
      errlog(`  [FFmpeg/AnimWebP] writeFrame failed:`, msg);
      if (isAbortError(e)) {
        throw new Error(`FFmpeg operation aborted: ${msg}`);
      }
      throw new Error(`Failed to write frame ${i} to FFmpeg FS: ${msg}`);
    }
    // Phase 1: frame-writing progress maps to the 0–0.5 range.
    onProgress?.(((i + 1) / frames.length) * 0.5);
  }

  // Final cancel check before encoding
  if (isCancelled?.()) {
    log(`  [FFmpeg/AnimWebP] Cancel requested before encoding. Cleaning up.`);
    for (const writtenName of frameNames) {
      try {
        await ff.deleteFile(writtenName, { signal });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!isAbortError(e)) {
          errlog(
            `  [FFmpeg/AnimWebP] cleanup deleteFile(${writtenName}) failed:`,
            msg,
          );
        }
      }
    }
    isFFmpegBusy = false;
    throw new Error("Encoding cancelled by user before encode phase.");
  }

  const outputName = "anim_output.webp";

  // Phase 2: FFmpeg encoding progress events map to the 0.5–1.0 range.
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(0.5 + Math.min(Math.max(progress, 0), 1) * 0.5);
  };
  ff.on("progress", progressHandler);
  try {
    log(
      `  [FFmpeg/AnimWebP] Encoding at ${fps} fps, quality=${quality}, method=${method}…`,
    );
    isFFmpegBusy = true;
    try {
      await withTimeout(
        ff.exec(
          [
            "-framerate",
            String(fps),
            "-i",
            "anim_%05d.png",
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
          ],
          undefined,
          { signal },
        ),
        FFMPEG_EXEC_TIMEOUT_MS,
        "animated WebP encoding",
      );
    } catch (e) {
      isFFmpegBusy = false;
      const msg = e instanceof Error ? e.message : String(e);
      errlog(`  [FFmpeg/AnimWebP] encode failed:`, msg);
      if (isAbortError(e)) {
        throw new Error(`FFmpeg operation aborted: ${msg}`);
      }
      throw new Error(`FFmpeg WebP encoding failed: ${msg}`);
    }

    const data = await ff.readFile(outputName, undefined, { signal });
    const buffer = new Uint8Array(
      typeof data === "string" ? new TextEncoder().encode(data) : data,
    ).buffer;
    log(`  [FFmpeg/AnimWebP] Encoding complete.`);
    onProgress?.(1.0);
    return new Blob([buffer], { type: "image/webp" });
  } finally {
    isFFmpegBusy = false;
    ff.off("progress", progressHandler);
    for (const name of frameNames) {
      try {
        await ff.deleteFile(name, { signal });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!isAbortError(e)) {
          errlog(
            `  [FFmpeg/AnimWebP] cleanup deleteFile(${name}) failed:`,
            msg,
          );
        }
      }
    }
    try {
      await ff.deleteFile(outputName, { signal });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isAbortError(e)) {
        errlog(
          `  [FFmpeg/AnimWebP] cleanup deleteFile(${outputName}) failed:`,
          msg,
        );
      }
    }
  }
};
