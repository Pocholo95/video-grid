import { useCallback, useEffect, useRef, useState } from "react";
import { FFMPEG_STALE_THRESHOLD_MS } from "../constants";
import { DEFAULTS } from "../constants";
import { createGridJpg } from "../grid";
import { closeMediaInfo, readMetadataMediaInfo } from "../mediainfo";
import {
  getAndClearTaskLogs,
  getIsFFmpegBusy,
  reinitFFmpeg,
  resetFFmpeg,
  setCurrentLogTaskId,
  setOnLogsChanged,
  setTaskAbortController,
} from "../ffmpeg";
import { createAnimatedGridWebP } from "../animatedGrid";
import type { AnimatedGridOptions } from "../animatedGrid";
import type { TaskItem, SavedOptions } from "../types";
import {
  errlog,
  formatElapsed,
  formatTime,
  hasUsableMetadata,
  log,
  makeId,
  warn,
} from "../utils";

export type ProcessorStatus = {
  text: string;
  /**
   * Semantic kind of the current `text` message. Drives the icon shown
   * by the consumer (ProcessingPanel) so we don't have to embed emoji
   * directly in the message string. Optional; consumer treats undefined
   * as "info".
   */
  textKind?: "info" | "success" | "warning" | "cancelled";
  currentPct: number;
  batchDone: number;
  batchTotal: number;
  batchStartTime: number | null;
  batchDurationMs: number | null;
};

type Updater = (id: string, patch: Partial<TaskItem>) => void;

/**
 * Fraction of per-file progress (0-100) allocated to the frame-composition
 * phase of animated WebP generation. The remaining share goes to FFmpeg encoding.
 */
const ANIMATED_COMPOSE_PCT = 70;
const ANIMATED_ENCODE_PCT = 100 - ANIMATED_COMPOSE_PCT;

/**
 * Hook that manages video analysis and grid-generation processing.
 *
 * @param updateItem - Callback to patch a single TaskItem by id.
 */
export function useProcessor(updateItem: Updater) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [staleTaskId, setStaleTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessorStatus>({
    text: "Select one or more videos to begin.",
    currentPct: 0,
    batchDone: 0,
    batchTotal: 0,
    batchStartTime: null,
    batchDurationMs: null,
  });

  const cancelRef = useRef(false);
  /**
   * Separate flag for force-killing only the current item's FFmpeg process
   * without stopping the entire batch. Checked alongside cancelRef in the
   * isCancelled callback, then cleared after the item fails so the loop
   * continues to the next file.
   */
  const forceCancelCurrentRef = useRef(false);
  const lastProgressTimeRef = useRef<number>(Date.now());
  const staleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);

  /**
   * Register a live-log callback so that whenever FFmpeg appends a log line,
   * the processor updates the current task's ffmpegLogs array immediately
   * (not just at task completion).
   */
  useEffect(() => {
    setOnLogsChanged((taskId, logs) => {
      updateItem(taskId, { ffmpegLogs: [...logs] });
    });
    return () => {
      setOnLogsChanged(null);
    };
  }, [updateItem]);

  /**
   * Analyze newly selected files with MediaInfo to populate metadata.
   * Updates each item in-place and calls updateItem after each file.
   *
   * @param files - The File objects selected by the user.
   * @returns A fully-populated TaskItem array ready for processing.
   */
  const analyzeFiles = useCallback(
    async (files: File[]): Promise<TaskItem[]> => {
      setStatus({
        text: `Analyzing ${files.length} file(s)…`,
        currentPct: 0,
        batchDone: 0,
        batchTotal: files.length,
        batchStartTime: null,
        batchDurationMs: null,
      });

      const items: TaskItem[] = files.map((file) => ({
        id: makeId(),
        file,
        status: "queued",
      }));

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const progress = ((i + 1) / files.length) * 100;
        setStatus({
          text: `Analyzing "${item.file.name}"…`,
          currentPct: progress,
          batchDone: i + 1,
          batchTotal: files.length,
          batchStartTime: null,
          batchDurationMs: null,
        });

        try {
          const meta = await readMetadataMediaInfo(item.file);
          item.metadata = meta;
          if (!hasUsableMetadata(meta)) {
            item.warning =
              "Could not read metadata from this file. Processing may fail or produce incorrect output.";
          }
          updateItem(item.id, {
            metadata: item.metadata,
            warning: item.warning,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Metadata read failed";
          item.warning = `Metadata analysis failed: ${msg}`;
          updateItem(item.id, { warning: item.warning });
          warn(`Metadata failed for "${item.file.name}":`, e);
        }
      }

      setStatus({
        text: `${files.length} new file(s) analyzed. Set your options/preset and press Start Processing.`,
        currentPct: 0,
        batchDone: 0,
        batchTotal: 0,
        batchStartTime: null,
        batchDurationMs: null,
      });

      return items;
    },
    [updateItem],
  );

  /**
   * Process all queued items, generating a JPEG grid or animated WebP for each one.
   *
   * @param items - The TaskItem list to process.
   * @param opts  - Current SavedOptions controlling grid layout and appearance.
   * @param isTaskActive - Optional callback to check if a task is still active (not removed).
   *                       If the task has been removed from the list, processing is skipped.
   */
  const processAll = useCallback(
    async (
      items: TaskItem[],
      opts: SavedOptions,
      isTaskActive?: (id: string) => boolean,
    ) => {
      if (isProcessing || !items.length) return;
      setIsProcessing(true);
      cancelRef.current = false;

      const baseGridOpts = {
        width: Math.max(240, opts.width || DEFAULTS.width),
        cols: Math.max(1, opts.cols || DEFAULTS.cols),
        rows: Math.max(1, opts.rows || DEFAULTS.rows),
        spacing: Math.max(0, opts.spacing || DEFAULTS.spacing),
        position: opts.position ?? DEFAULTS.position,
        header: opts.header ?? DEFAULTS.header,
        bgColor: opts.bgColor || DEFAULTS.bgColor,
        textColor: opts.textColor || DEFAULTS.textColor,
        vrMode: opts.vrMode ?? DEFAULTS.vrMode,
        // Pass through the custom template when present and non-empty.
        gridTemplate:
          opts.gridTemplate && opts.gridTemplate.cells.length > 0
            ? opts.gridTemplate
            : undefined,
      };

      const isAnimated = opts.animated ?? false;

      // Reset stale state when starting a new batch
      setIsStale(false);
      setStaleTaskId(null);
      lastProgressTimeRef.current = Date.now();

      // Separate counters for each terminal state so the final message can
      // show a detailed breakdown.
      let succeeded = 0;
      let errored = 0;
      let cancelled = 0;
      const batchStartTime = Date.now();

      setStatus({
        text: "Starting…",
        currentPct: 0,
        batchDone: 0,
        batchTotal: items.length,
        batchStartTime,
        batchDurationMs: null,
      });

      try {
        for (const item of items) {
          // Skip tasks that have been removed from the list — do NOT
          // increment processed, so the final status message only counts files
          // that were actually processed.
          if (isTaskActive && !isTaskActive(item.id)) {
            continue;
          }

          if (cancelRef.current) {
            updateItem(item.id, { status: "cancelled" });
            cancelled++;
            continue;
          }

          const itemStartTime = Date.now();
          currentTaskIdRef.current = item.id;
          setCurrentLogTaskId(item.id);
          // Create a fresh AbortController so all FFmpeg calls for this file
          // can be cancelled together when forceCancel is triggered.
          setTaskAbortController();
          lastProgressTimeRef.current = Date.now();
          updateItem(item.id, {
            status: "processing",
            error: undefined,
            processingStartedAt: itemStartTime,
            ffmpegLogs: [],
          });

          const batchProcessed = succeeded + errored;
          setStatus({
            text: `"${item.file.name}" — opening…`,
            currentPct: 0,
            batchDone: batchProcessed,
            batchTotal: items.length,
            batchStartTime,
            batchDurationMs: null,
          });

          log(`Starting "${item.file.name}"`);

          const onWarning = (message: string) => {
            updateItem(item.id, { warning: message });
            warn(`[${item.file.name}] ${message}`);
          };

          try {
            let meta = item.metadata;
            // Re-read meta data if somehow it isn't present
            if (!meta) {
              meta = await readMetadataMediaInfo(item.file, (pct, msg) => {
                setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — ${msg}`,
                  currentPct: pct,
                }));
              });
              updateItem(item.id, { metadata: meta });
            }

            if (!hasUsableMetadata(meta)) {
              throw new Error(
                "MediaInfo could not determine video dimensions or duration. " +
                  "The file may be corrupt or in an unrecognized format.",
              );
            }

            // Attach per-item custom timestamps to the grid options for this file.
            const itemCustomTimestamps =
              item.timestampMode === "custom" &&
              item.customTimestamps &&
              item.customTimestamps.length > 0
                ? item.customTimestamps
                : undefined;

            const gridOpts = {
              ...baseGridOpts,
              customTimestamps: itemCustomTimestamps,
            };

            // Animated options — built per-item so customTimestamps is correctly scoped.
            const animGridOpts: AnimatedGridOptions = {
              ...gridOpts,
              animDuration: Math.max(
                1,
                opts.animDuration ?? DEFAULTS.animDuration,
              ),
              animFps: Math.max(1, opts.animFps ?? DEFAULTS.animFps),
              webpMethod: opts.webpMethod ?? DEFAULTS.webpMethod,
              webpQuality: Math.min(
                100,
                Math.max(5, opts.webpQuality ?? DEFAULTS.webpQuality),
              ),
            };

            let res;
            if (isAnimated) {
              /**
               * Animated WebP progress is split into two phases:
               *   1. Frame composition (seeks + canvas draw):  0 - ANIMATED_COMPOSE_PCT %
               *   2. FFmpeg WebP encoding:  ANIMATED_COMPOSE_PCT - 100 %
               *
               * The encode callback receives a 0-1 ratio where:
               *   0.0-0.5 = PNG frames being written to FFmpeg's virtual FS
               *   0.5-1.0 = libwebp encoding in progress (driven by FFmpeg progress events)
               */
              const onAnimFrameDone = (
                composedFrame: number,
                totalFrames: number,
              ) => {
                lastProgressTimeRef.current = Date.now();
                setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — composing frame ${composedFrame}/${totalFrames}`,
                  currentPct:
                    (composedFrame / totalFrames) * ANIMATED_COMPOSE_PCT,
                  batchDone: succeeded + errored,
                  batchTotal: items.length,
                }));
              };

              const onEncodeProgress = (ratio: number) => {
                lastProgressTimeRef.current = Date.now();
                const pct = ANIMATED_COMPOSE_PCT + ratio * ANIMATED_ENCODE_PCT;
                const phaseLabel =
                  ratio < 0.5
                    ? `preparing frames (${Math.round((ratio / 0.5) * 100)}%)`
                    : `encoding WebP (${Math.round(((ratio - 0.5) / 0.5) * 100)}%)`;
                setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — ${phaseLabel}`,
                  currentPct: pct,
                  batchDone: succeeded + errored,
                  batchTotal: items.length,
                }));
              };

              res = await createAnimatedGridWebP(
                item.file,
                meta,
                animGridOpts,
                () => cancelRef.current || forceCancelCurrentRef.current,
                onAnimFrameDone,
                onEncodeProgress,
                onWarning,
              );
            } else {
              const onFrameDone = (
                frameIdx: number,
                totalFrames: number,
                tSec: number,
              ) => {
                lastProgressTimeRef.current = Date.now();
                setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — frame ${frameIdx}/${totalFrames} @ ${formatTime(tSec)}`,
                  currentPct: (frameIdx / totalFrames) * 100,
                  batchDone: succeeded + errored,
                  batchTotal: items.length,
                }));
              };

              res = await createGridJpg(
                item.file,
                meta,
                gridOpts,
                () => cancelRef.current || forceCancelCurrentRef.current,
                onFrameDone,
                onWarning,
              );
            }

            const ffmpegLogs = getAndClearTaskLogs(item.id);
            const itemCancelledMidProcessing = cancelRef.current;
            updateItem(item.id, {
              outputName: res.outputName,
              outputSize: res.outputSize,
              outputBlob: res.outputBlob,
              status: itemCancelledMidProcessing ? "cancelled" : "done",
              error: undefined,
              processingDurationMs: Date.now() - itemStartTime,
              ffmpegLogs,
            });

            // Task went through processing successfully
            if (!itemCancelledMidProcessing) {
              succeeded++;
            } else {
              cancelled++;
            }

            log(`Finished "${item.file.name}"`);
            setStatus((prev) => ({
              ...prev,
              currentPct: 100,
              batchDone: succeeded + errored,
            }));
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            const ffmpegLogs = getAndClearTaskLogs(item.id);
            // Distinguish between user-initiated force cancel, normal user
            // cancel, and genuine processing errors so the task shows the
            // correct status. Evaluate BEFORE clearing flags.
            // Note: forceCancelCurrentRef is trusted on its own — when the
            // user clicks Kill we set the flag AND call resetFFmpeg(). The
            // resulting exception may be an AbortError or any other error
            // (depends on whether FFmpeg.terminate() rejects before/after the
            // frame loop's isCancelled() check), so we must NOT require
            // isAbortError(e) for force-cancel detection.
            const wasForceCancelled = forceCancelCurrentRef.current === true;
            const wasUserCancelled = cancelRef.current;
            // Clear force-cancel flag so the batch continues to the next item
            forceCancelCurrentRef.current = false;
            const itemErrored = !(wasUserCancelled || wasForceCancelled);
            updateItem(item.id, {
              status:
                wasUserCancelled || wasForceCancelled ? "cancelled" : "error",
              error: msg,
              processingDurationMs: Date.now() - itemStartTime,
              ffmpegLogs,
            });
            // Task went through processing and failed with a genuine error – count it
            if (itemErrored) {
              errored++;
            } else {
              cancelled++;
            }
            errlog(`Failed "${item.file.name}":`, e);
            const batchProcessed = succeeded + errored;
            setStatus((prev) => ({
              ...prev,
              text: `Error on "${item.file.name}": ${msg}`,
              textKind: wasForceCancelled ? "cancelled" : undefined,
              batchDone: batchProcessed,
            }));
          } finally {
            // Clear the force-cancel flag and capture whether forceCancel was
            // called for this task. When forceCancel runs it already calls
            // resetFFmpeg() + reinitFFmpeg(), so calling resetFFmpeg() again
            // here would terminate the freshly reinitialized instance.
            const wasForceCancelledThisTask =
              forceCancelCurrentRef.current === true;
            forceCancelCurrentRef.current = false;
            // Reset FFmpeg WASM between tasks to release the WASM heap memory.
            // WASM heaps grow monotonically and never shrink, so after several
            // large files the heap becomes enormous and the next operation fails.
            // Terminating the instance releases all memory back to the browser.
            // Skip when forceCancel already handled the reset + reinit cycle.
            if (!wasForceCancelledThisTask) {
              resetFFmpeg();
            }
          }
        }
      } finally {
        const batchDurationMs = Date.now() - batchStartTime;
        // Clean up stale detection interval
        if (staleIntervalRef.current) {
          clearInterval(staleIntervalRef.current);
          staleIntervalRef.current = null;
        }
        setIsProcessing(false);
        setIsStale(false);
        setStaleTaskId(null);
        const total = items.length;
        // Build detailed breakdown: "Done. 8 succeeded, 2 failed. (10 total) 2.3s"
        // or "Cancelled. 3 succeeded, 1 failed, 6 cancelled. (10 total) 1.5s"
        const parts = [`${succeeded} succeeded`, `${errored} failed`];
        if (cancelled > 0) {
          parts.push(`${cancelled} cancelled`);
        }
        const breakdown = parts.join(", ");
        const label = cancelRef.current ? "Cancelled" : "Done";

        setStatus((prev) => ({
          ...prev,
          currentPct: 0,
          batchDone: succeeded + errored,
          batchStartTime: null,
          batchDurationMs,
          text: `${label}. ${breakdown}. (${total} total, ${formatElapsed(batchDurationMs)})`,
          textKind: cancelRef.current ? "cancelled" : "success",
        }));
      }
    },
    [isProcessing, updateItem],
  );

  /** Signal the running batch to stop after the current frame completes. */
  const requestCancel = useCallback(() => {
    cancelRef.current = true;
    setStatus((prev) => ({ ...prev, text: "Cancelling…" }));
    warn("Cancel requested by user");
  }, []);

  /**
   * Force-kill the FFmpeg WASM instance for the current item only.
   * Sets the force-cancel flag so the frame loop detects it via
   * isCancelled(), then terminates the FFmpeg worker. Re-initialization
   * happens in the per-item finally block (resetFFmpeg + the next task's
   * setTaskAbortController / prepareFFmpegInput will trigger a fresh load),
   * avoiding a race where forceCancel's reinitFFmpeg loads a new instance
   * while the frame loop is still unwinding on the old one.
   *
   * Does NOT set cancelRef so the batch continues to the next file.
   */
  const forceCancel = useCallback(async () => {
    forceCancelCurrentRef.current = true;
    setIsStale(false);
    setStaleTaskId(null);
    setStatus((prev) => ({
      ...prev,
      text: "Force-killing FFmpeg…",
      textKind: "warning",
    }));
    warn("Force cancel: terminating FFmpeg WASM for current item only");
    // Terminate the FFmpeg worker so any in-flight ff.exec() rejects.
    // The frame loop's isCancelled() check will also catch the flag and
    // throw, propagating to the catch block below which clears the flag.
    resetFFmpeg();
    // Re-initialize AFTER the terminate — the frame loop should have
    // already exited by now (exec rejected or isCancelled threw).
    // If not, the next call to prepareFFmpegInput will get the new
    // instance and immediately hit isCancelled() again.
    try {
      await reinitFFmpeg();
      setStatus((prev) => ({
        ...prev,
        text: "FFmpeg restored — continuing to next file.",
        textKind: "info",
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errlog("FFmpeg re-initialization failed:", msg);
      setStatus((prev) => ({
        ...prev,
        text: `FFmpeg restore failed: ${msg}. Subsequent files will be skipped.`,
        textKind: "warning",
      }));
    }
  }, []);

  /** Reset processing state and release WASM resources. */
  const resetState = useCallback(() => {
    resetFFmpeg();
    closeMediaInfo();
    setStatus({
      text: "Selection cleared.",
      currentPct: 0,
      batchDone: 0,
      batchTotal: 0,
      batchStartTime: null,
      batchDurationMs: null,
    });
  }, []);

  /**
   * Stale detection: periodically check if progress has stalled while FFmpeg
   * is busy. If progress hasn't advanced for FFMPEG_STALE_THRESHOLD_MS and
   * FFmpeg is still busy, mark the operation as stale.
   */
  useEffect(() => {
    if (!isProcessing) return;

    staleIntervalRef.current = setInterval(() => {
      const elapsedSinceProgress = Date.now() - lastProgressTimeRef.current;
      if (
        elapsedSinceProgress > FFMPEG_STALE_THRESHOLD_MS &&
        getIsFFmpegBusy()
      ) {
        warn(
          `[Stale Detection] Progress stalled for ${elapsedSinceProgress}ms while FFmpeg is busy.`,
        );
        setIsStale(true);
        setStaleTaskId(currentTaskIdRef.current);
      }
    }, 5000);

    return () => {
      if (staleIntervalRef.current) {
        clearInterval(staleIntervalRef.current);
        staleIntervalRef.current = null;
      }
    };
  }, [isProcessing]);

  return {
    isProcessing,
    isStale,
    staleTaskId,
    status,
    analyzeFiles,
    processAll,
    requestCancel,
    forceCancel,
    resetState,
  };
}
