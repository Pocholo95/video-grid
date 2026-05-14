import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { FFMPEG_EXEC_TIMEOUT_MS } from "./constants";
import { errlog, humanSize, log } from "./utils";

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
export const getFFmpeg = async (): Promise<FFmpeg> => {
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
  isFFmpegBroken = false;

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
 * Extracts a single frame from a video file using FFmpeg WASM.
 * The frame is decoded at the given timestamp and returned as an ImageBitmap.
 * The extracted frame file is cleaned up from the virtual filesystem immediately.
 *
 * This is the memory-efficient alternative to extractFramesFFmpegBatch: it
 * processes one frame at a time so the JS heap never holds more than one
 * ImageBitmap from FFmpeg at a time.
 *
 * Uses fast keyframe seeking (-ss before -i) for performance, and scales
 * the output to the target dimensions to minimize memory usage.
 *
 * @param file         - The source video file.
 * @param timestamp    - Timestamp (seconds) at which to extract the frame.
 * @param isCancelled  - Optional pollable callback; if it returns true, extraction aborts.
 * @param targetWidth  - Optional target width; if provided, frame is scaled to fit.
 * @param targetHeight - Optional target height; if provided, frame is scaled to fit.
 * @returns ImageBitmap for the extracted frame, or null on failure.
 */
export const extractFrameFFmpeg = async (
  file: File,
  timestamp: number,
  isCancelled?: () => boolean,
  targetWidth?: number,
  targetHeight?: number,
): Promise<ImageBitmap | null> => {
  if (isCancelled?.()) return null;

  const ff = await prepareFFmpegInput(file);
  const signal = getCurrentAbortSignal();
  const name = "frame_temp.jpg";

  // -ss BEFORE -i for fast keyframe seek (precise seek after -i is extremely
  // slow for long videos in WASM because it must decode from the start).
  // For a contact sheet, keyframe-level imprecision (±1–2s) is acceptable.
  const args: string[] = ["-ss", String(timestamp), "-i", "input.mp4"];

  // Scale to target cell dimensions to minimize memory
  if (targetWidth && targetHeight) {
    args.push("-vf", `scale=${targetWidth}:${targetHeight}`);
  }

  args.push(
    "-update",
    "1", // Allow overwriting the output file on repeated extractions
    "-frames:v",
    "1",
    "-q:v",
    "3", // Good quality (1-31 scale) — 3 is visually identical at thumbnail size
    "-loglevel",
    "info",
    name,
  );

  log(
    `  [FFmpeg] Single frame at t=${timestamp.toFixed(3)}s` +
      (targetWidth ? ` → ${targetWidth}x${targetHeight}` : ""),
  );
  isFFmpegBusy = true;
  let execDone = false;
  try {
    await withTimeout(
      ff.exec(args, undefined, { signal }),
      FFMPEG_EXEC_TIMEOUT_MS,
      `frame extraction at t=${timestamp.toFixed(3)}s`,
    );
    execDone = true;
    /*
     * Check cancellation *after* exec completes (success or not).
     * When forceCancel() calls resetFFmpeg() the in-flight exec may not
     * reject with an AbortError (it depends on whether the WASM worker
     * streams the abort before / after the terminate).  By also checking
     * isCancelled here we guarantee the frame loop is stopped regardless
     * of how the underlying exec promise settles.
     */
    if (isCancelled?.()) {
      throw new DOMException("Processing cancelled", "AbortError");
    }
    const data = await ff.readFile(name, undefined, { signal });
    const arrayBuffer = new Uint8Array(
      typeof data === "string" ? new TextEncoder().encode(data) : data,
    ).buffer;
    const blob = new Blob([arrayBuffer], { type: "image/jpeg" });
    return await createImageBitmap(blob);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errlog(`  [FFmpeg] Single frame extraction failed:`, msg);

    if (isAbortError(e)) {
      throw new Error(`FFmpeg operation aborted: ${msg}`);
    }

    if (isMemoryError(e)) {
      errlog(
        `  [FFmpeg] OOM / abort condition. Consider reducing grid size or output resolution.`,
      );
    }
    return null;
  } finally {
    isFFmpegBusy = false;
    /*
     * Only try to clean up the temp file if exec actually ran to
     * completion — after resetFFmpeg() the ff instance is terminated
     * and any call on it throws.  We also guard against the case where
     * forceCancel() has already nulled the global `ffmpeg` reference but
     * this local `ff` variable still holds the dead instance.
     */
    if (execDone && ffmpeg !== null) {
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
};

/**
 * Encodes animated WebP from PNG frames that are already written to FFmpeg's
 * virtual filesystem. This avoids the double-memory hit of holding PNG blobs
 * in JS memory AND writing them to the FS.
 *
 * @param frameNames     - Array of PNG filenames already in FFmpeg FS.
 * @param totalFrames    - Number of frames to encode.
 * @param fps            - Target frame rate.
 * @param quality        - WebP quality (0-100).
 * @param method         - WebP compression method (0-6).
 * @param isCancelled    - Optional pollable callback.
 * @param onProgress     - Optional callback receiving 0-1 ratio.
 * @returns The encoded animated WebP as a Blob.
 */
export const encodeAnimatedWebPFromFS = async (
  frameNames: string[],
  totalFrames: number,
  fps: number,
  quality: number,
  method: number,
  isCancelled?: () => boolean,
  onProgress?: (ratio: number) => void,
): Promise<Blob> => {
  const ff = await getFFmpeg();
  const signal = getCurrentAbortSignal();

  // Final cancel check before encoding
  if (isCancelled?.()) {
    log(`  [FFmpeg/AnimWebP] Cancel requested before encoding. Cleaning up.`);
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
    isFFmpegBusy = false;
    throw new Error("Encoding cancelled by user before encode phase.");
  }

  const outputName = "anim_output.webp";

  // Determine the input pattern from the frame names.
  // Frame names are like "anim_00000.png", "anim_00001.png", etc.
  // We extract the base pattern: prefix + zero-padded width + extension.
  const firstFrame = frameNames[0]; // e.g. "anim_00000.png"
  const padWidth = firstFrame.match(/_(\d+)\./)?.[1]?.length || 5;
  const prefix = firstFrame.substring(
    0,
    firstFrame.indexOf(`_${"0".repeat(padWidth)}`),
  );
  const ext = firstFrame.substring(firstFrame.lastIndexOf("."));
  const inputPattern = `${prefix}_%0${padWidth}d${ext}`;

  // FFmpeg encoding progress events map to the 0.0–1.0 range.
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(Math.max(progress, 0), 1));
  };
  ff.on("progress", progressHandler);
  try {
    log(
      `  [FFmpeg/AnimWebP] Encoding ${totalFrames} frames at ${fps} fps, quality=${quality}, method=${method}…`,
    );
    log(`  [FFmpeg/AnimWebP] Input pattern: ${inputPattern}`);
    isFFmpegBusy = true;
    try {
      await withTimeout(
        ff.exec(
          [
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
    /*
     * After forceCancel() the global ffmpeg reference is null and the local
     * `ff` variable points to a dead (terminated) instance.  Any method call
     * on it will throw, so guard the cleanup.
     */
    if (ffmpeg !== null) {
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
  }
};

/**
 * Extracts a batch of frames from a video file using FFmpeg WASM.
 * Each frame is decoded at the given timestamp and returned as an ImageBitmap.
 * Failed frames are returned as null and reported via `onFrameExtracted`.
 *
 * NOTE: This function holds all extracted ImageBitmaps in memory
 * simultaneously. For large frame counts, prefer extractFrameFFmpeg
 * (single-frame, on-demand extraction) to reduce peak memory usage.
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
      /*
       * After forceCancel() the global ffmpeg reference is null and the local
       * `ff` variable points to a dead (terminated) instance.  Guard cleanup.
       */
      if (ffmpeg !== null) {
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
    /*
     * After forceCancel() the global ffmpeg reference is null and the local
     * `ff` variable points to a dead (terminated) instance.  Guard cleanup.
     */
    if (ffmpeg !== null) {
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
  }
};
