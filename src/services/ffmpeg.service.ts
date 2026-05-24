/**
 * FFmpeg WASM Service - self-contained singleton with full feature parity
 * to the original ffmpeg.ts module.
 *
 * Manages its own FFmpeg instance with:
 *  - Lazy loading with singleton pattern
 *  - Health check on reinit
 *  - Per-task log buffering with React subscriber callback
 *  - Per-task AbortController for cancellation
 *  - Timeout wrapper on all FFmpeg operations
 *  - OOM / abort error detection
 *  - Busy / broken state tracking
 *  - Input file caching (avoids rewriting input.mp4)
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { FFMPEG_EXEC_TIMEOUT_MS } from "../constants";
import type { IFFmpegService } from "../types/service";
import { errlog, humanSize, log } from "../utils";

/** - Module-level singleton state (shared across all callers) */

let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let currentFFmpegInputKey: string | null = null;

/** Tracks whether an FFmpeg WASM operation is currently in progress. */
let isFFmpegBusy = false;

/**
 * Global flag indicating FFmpeg is in an unrecoverable broken state.
 * When true, init/getInstance will refuse to return an instance until
 * reset() is called and a fresh load succeeds.
 */
let isFFmpegBroken = false;

/**
 * Per-task AbortController used to cancel in-flight FFmpeg operations
 * immediately when a force cancel occurs.
 */
let taskAbortController: AbortController | null = null;

/**
 * Per-task FFmpeg log buffer. Keyed by TaskItem id.
 */
const taskLogs: Record<string, string[]> = {};
let currentLogTaskId: string | null = null;

/**
 * React-style subscriber callback invoked whenever a new log line is appended
 * to the current task's buffer.
 */
let onLogsChanged: ((id: string, logs: string[]) => void) | null = null;

/** - Internal helpers */

/** Append a log line to the current task's buffer. */
function appendTaskLog(line: string) {
  if (currentLogTaskId) {
    if (!taskLogs[currentLogTaskId]) taskLogs[currentLogTaskId] = [];
    taskLogs[currentLogTaskId].push(line);
    onLogsChanged?.(currentLogTaskId, taskLogs[currentLogTaskId]);
  }
}

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

/**
 * Wraps a promise with a timeout. If the promise does not resolve within
 * the given milliseconds, a descriptive error is thrown.
 */
function withTimeout(
  promise: Promise<unknown>,
  ms: number,
  label: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      abortController.abort();
      reject(
        new Error(
          `[FFmpeg Timeout] "${label}" did not complete within ${ms}ms. ` +
            "The operation may be stuck. Check the console for details.",
        ),
      );
    }, ms);
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
}

/** - FFmpeg Service Implementation */

export class FFmpegService implements IFFmpegService {
  /** - Lifecycle */

  /** Initialize FFmpeg WASM instance. Idempotent. */
  public async init(): Promise<void> {
    await this.getInstance();
  }

  /** Check if instance is loaded and functional. */
  public isReady(): boolean {
    return !isFFmpegBroken;
  }

  /** Terminate and release all resources. */
  public async destroy(): Promise<void> {
    this.resetSync();
  }

  /**
   * Terminate FFmpeg instance for between-task cleanup.
   * Releases WASM heap memory so the next task starts fresh.
   */
  public async reset(): Promise<void> {
    this.resetSync();
  }

  /** Re-initialize after termination (with health check). */
  public async reinit(): Promise<void> {
    log("[FFmpeg] Re-initializing FFmpeg WASM instance…");
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

      if (!(await healthCheckFFmpeg(inst))) {
        throw new Error(
          "FFmpeg loaded but health check failed — instance is non-functional.",
        );
      }

      ffmpeg = inst;
      ffmpegLoadPromise = Promise.resolve(inst);
      log(
        "[FFmpeg] Instance re-initialized successfully (health check passed).",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errlog("[FFmpeg] Re-initialization failed:", msg);
      ffmpeg = null;
      ffmpegLoadPromise = null;
      isFFmpegBroken = true;
      throw new Error(`FFmpeg re-initialization failed: ${msg}`);
    }
  }

  /** - FFmpeg Operations (with timeout & abort signal) */

  /** Execute an FFmpeg command with timeout and abort signal support. */
  public async exec(args: string[]): Promise<void> {
    const ff = await this.getInstance();
    const signal = this.getAbortSignal();
    isFFmpegBusy = true;
    try {
      await withTimeout(
        ff.exec(args, undefined, { signal }),
        FFMPEG_EXEC_TIMEOUT_MS,
        `exec(${args.slice(0, 6).join(" ")})`,
      );
    } finally {
      isFFmpegBusy = false;
    }
  }

  /** Write data to FFmpeg virtual filesystem with timeout. */
  public async writeData(path: string, data: Uint8Array): Promise<void> {
    const ff = await this.getInstance();
    const signal = this.getAbortSignal();
    isFFmpegBusy = true;
    try {
      await withTimeout(
        ff.writeFile(path, data, { signal }),
        FFMPEG_EXEC_TIMEOUT_MS,
        `writeFile(${path})`,
      );
    } finally {
      isFFmpegBusy = false;
    }
  }

  /** Read data from FFmpeg virtual filesystem. */
  public async readData(path: string): Promise<Uint8Array> {
    const ff = await this.getInstance();
    const signal = this.getAbortSignal();
    const data = await ff.readFile(path, undefined, { signal });
    return new Uint8Array(
      typeof data === "string" ? new TextEncoder().encode(data) : data,
    );
  }

  /** List files in FFmpeg virtual filesystem. */
  public async listDir(path: string): Promise<unknown[]> {
    const ff = await this.getInstance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await ff.listDir(path)) as any;
  }

  /** Delete a file from virtual filesystem. */
  public async deleteFile(path: string): Promise<void> {
    if (!ffmpeg) return;
    const signal = this.getAbortSignal();
    try {
      await ffmpeg.deleteFile(path, { signal });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isAbortError(e)) {
        errlog(`  [FFmpeg] deleteFile(${path}) failed:`, msg);
      }
    }
  }

  /** - Input Management (with caching) */

  /**
   * Ensures the given file is written to the FFmpeg virtual filesystem as
   * `input.mp4`, reusing the cached entry when the file identity matches.
   */
  public async writeInputFile(file: File): Promise<void> {
    const ff = await this.getInstance();
    const signal = this.getAbortSignal();
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (currentFFmpegInputKey !== key) {
      try {
        await ff.deleteFile("input.mp4", { signal });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!isAbortError(e)) {
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
  }

  /** Removes `input.mp4` from the FFmpeg virtual filesystem and clears the cache key. */
  public async cleanupInput(): Promise<void> {
    if (!ffmpeg) return;
    const signal = this.getAbortSignal();
    try {
      await ffmpeg.deleteFile("input.mp4", { signal });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isAbortError(e)) {
        errlog("  [FFmpeg] cleanup deleteFile failed:", msg);
      }
    }
    currentFFmpegInputKey = null;
  }

  /** Get the current input cache key (for debugging). */
  public getInputKey(): string | null {
    return currentFFmpegInputKey;
  }

  /** - Log Management */

  /** Register callback for FFmpeg log lines. */
  public onLog(
    callback: ((taskId: string, logs: string[]) => void) | null,
  ): void {
    onLogsChanged = callback;
  }

  /** Register callback for FFmpeg progress events ({ progress: number }). */
  public onProgress(
    callback: ((data: { progress: number }) => void) | null,
  ): void {
    if (ffmpeg && callback) {
      ffmpeg.on("progress", callback as never);
    }
  }

  /** Remove a previously registered progress callback. */
  public offProgress(
    callback: ((data: { progress: number }) => void) | null,
  ): void {
    if (ffmpeg && callback) {
      ffmpeg.off("progress", callback as never);
    }
  }

  /** Set the current task id so FFmpeg logs are routed to the right TaskItem. */
  public setTaskId(id: string | null): void {
    currentLogTaskId = id;
    if (id) taskLogs[id] = [];
  }

  /** Get accumulated logs for a task and clear them. */
  public getAndClearLogs(taskId: string): string[] {
    const logs = taskLogs[taskId] || [];
    delete taskLogs[taskId];
    return logs;
  }

  /** - Abort Control */

  /** Create a fresh AbortController for the current task. */
  public setAbortController(): AbortController {
    taskAbortController = new AbortController();
    return taskAbortController;
  }

  /** Abort current FFmpeg operation (terminate instance). */
  public abortCurrent(): void {
    this.resetSync();
  }

  /** Get the current task's AbortSignal. */
  public getAbortSignal(): AbortSignal | undefined {
    return taskAbortController?.signal;
  }

  /** - State Queries */

  /** Check if FFmpeg is currently busy. */
  public getBusyState(): boolean {
    return isFFmpegBusy;
  }

  /** Check if FFmpeg is in a broken state. */
  public getBrokenState(): boolean {
    return isFFmpegBroken;
  }

  /** - Private Helpers */

  /** Returns the shared FFmpeg instance, initialising it on first call. */
  private async getInstance(): Promise<FFmpeg> {
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
      const msg = e instanceof Error ? e.message : String(e);
      errlog(
        "[FFmpeg] getInstance: load promise rejected, clearing for retry:",
        msg,
      );
      ffmpegLoadPromise = null;
      ffmpeg = null;
      throw new Error(`FFmpeg load failed: ${msg}`);
    }
  }

  /** Terminate the FFmpeg instance and clear all cached state. */
  private resetSync(): void {
    isFFmpegBusy = false;
    isFFmpegBroken = false;

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
  }
}

/** - Legacy utility functions (used by grid.ts / animatedGrid.ts) */

/** Returns true if the error looks like a WASM out-of-memory or abort condition. */
export const isMemoryError = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message : String(e);
  if (isAbortError(e)) return false;
  return /out.of.bounds|memory|unreachable|OOM|heap/i.test(msg);
};

/** Returns true if the error is an abort/cancellation error. */
export const isAbortError = (e: unknown): boolean => {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /abort/i.test(msg);
};
