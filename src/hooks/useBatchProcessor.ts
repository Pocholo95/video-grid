import { useCallback, useRef } from "react";
import { ANIMATED_COMPOSE_PCT, ANIMATED_ENCODE_PCT } from "../constants";
import type { IGridRenderer } from "../types/service";
import type { IFFmpegService, IMediaInfoService } from "../types/service";
import type { TaskItem, SavedOptions } from "../types";
import {
  buildStaticGridOptions,
  buildAnimatedGridOptions,
} from "../gridOptions";
import {
  errlog,
  formatElapsed,
  formatTime,
  hasUsableMetadata,
  log,
  warn,
} from "../utils";
import { useTaskStore } from "@/store/taskStore";
import {
  useProcessingStore,
  getProcessingGuard,
  setProcessingGuard,
} from "@/store/processingStore";

/**
 * Hook that handles batch processing: iterating over queued items,
 * generating grid images, tracking progress, and handling errors/cancels.
 *
 * Uses Zustand store action methods (updateItem, setIsProcessing, setStatus)
 * instead of raw setState mutations for better encapsulation.
 */
export function useBatchProcessor(
  gridRenderer: IGridRenderer,
  ffmpeg: IFFmpegService,
  mediainfo: IMediaInfoService,
) {
  const cancelRef = useRef(false);
  const forceCancelCurrentRef = useRef(false);

  /**
   * Process all queued items, generating a JPEG grid or animated WebP for each one.
   */
  const processAll = useCallback(
    async (items: TaskItem[], opts: SavedOptions) => {
      if (getProcessingGuard() || !items.length) return;
      setProcessingGuard(true);
      useProcessingStore.getState().setIsProcessing(true);
      cancelRef.current = false;

      const isAnimated = opts.animated ?? false;

      let succeeded = 0;
      let errored = 0;
      let cancelled = 0;
      const batchStartTime = Date.now();

      useProcessingStore.getState().setStatus({
        text: "Starting…",
        currentPct: 0,
        batchDone: 0,
        batchTotal: items.length,
        batchStartTime,
        batchDurationMs: null,
      });

      // Dynamic queue: starts with the initial items, but new queued items
      // added during processing are picked up automatically.
      const queue: TaskItem[] = [...items];

      try {
        let idx = 0;
        while (idx < queue.length) {
          const item = queue[idx];

          // Check if item still exists in store (may have been removed)
          const storeItems = useTaskStore.getState().items;
          const stillExists = storeItems.find((i) => i.id === item.id);
          if (!stillExists) {
            idx++;
            continue;
          }

          // Check if item is still queued (may have been processed already)
          if (item.status !== "queued") {
            idx++;
            continue;
          }

          if (cancelRef.current) {
            useTaskStore
              .getState()
              .updateItem(item.id, { status: "cancelled" });
            cancelled++;
            idx++;
            continue;
          }

          const itemStartTime = Date.now();
          ffmpeg.setTaskId(item.id);
          ffmpeg.setAbortController();
          useTaskStore.getState().updateItem(item.id, {
            status: "processing",
            error: undefined,
            processingStartedAt: itemStartTime,
            ffmpegLogs: [],
          });

          const batchProcessed = succeeded + errored;
          useProcessingStore.getState().setStatus({
            text: `"${item.file.name}" — opening…`,
            currentPct: 0,
            batchDone: batchProcessed,
            batchTotal: items.length,
            batchStartTime,
            batchDurationMs: null,
          });

          // Update stale detection
          useProcessingStore.getState().touchProgress();
          useProcessingStore.getState().setCurrentTask(item.id);

          log(`Starting "${item.file.name}"`);

          const onWarning = (message: string) => {
            useTaskStore.getState().updateItem(item.id, { warning: message });
            warn(`[${item.file.name}] ${message}`);
          };

          try {
            let meta = item.metadata;
            if (!meta) {
              meta = await mediainfo.analyze(item.file, (pct, msg) => {
                useProcessingStore.getState().setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — ${msg}`,
                  currentPct: pct,
                }));
              });
              useTaskStore.getState().updateItem(item.id, { metadata: meta });
            }

            if (!hasUsableMetadata(meta)) {
              throw new Error(
                "MediaInfo could not determine video dimensions or duration. " +
                  "The file may be corrupt or in an unrecognized format.",
              );
            }

            const gridOpts = buildStaticGridOptions(opts, item, meta);
            const animGridOpts = buildAnimatedGridOptions(opts, item, meta);

            let res;
            if (isAnimated) {
              const onAnimCellDone = (
                composedCell: number,
                totalCells: number,
              ) => {
                useProcessingStore.getState().setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — composing cell ${composedCell}/${totalCells}`,
                  currentPct:
                    (composedCell / totalCells) * ANIMATED_COMPOSE_PCT,
                  batchDone: succeeded + errored,
                  batchTotal: items.length,
                }));
                useProcessingStore.getState().touchProgress();
              };

              const onEncodeProgress = (ratio: number) => {
                const pct = ANIMATED_COMPOSE_PCT + ratio * ANIMATED_ENCODE_PCT;
                const phaseLabel =
                  ratio < 0.5
                    ? `preparing frames (${Math.round((ratio / 0.5) * 100)}%)`
                    : `encoding WebP (${Math.round(((ratio - 0.5) / 0.5) * 100)}%)`;
                useProcessingStore.getState().setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — ${phaseLabel}`,
                  currentPct: pct,
                  batchDone: succeeded + errored,
                  batchTotal: items.length,
                }));
                useProcessingStore.getState().touchProgress();
              };

              res = await gridRenderer.renderAnimatedGrid(
                item.file,
                meta,
                animGridOpts,
                () => cancelRef.current || forceCancelCurrentRef.current,
                onAnimCellDone,
                onEncodeProgress,
                onWarning,
              );
            } else {
              const onCellDone = (
                cellIdx: number,
                totalCells: number,
                tSec: number,
              ) => {
                useProcessingStore.getState().setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — cell ${cellIdx}/${totalCells} @ ${formatTime(tSec)}`,
                  currentPct: (cellIdx / totalCells) * 100,
                  batchDone: succeeded + errored,
                  batchTotal: items.length,
                }));
                useProcessingStore.getState().touchProgress();
              };

              res = await gridRenderer.renderStaticGrid(
                item.file,
                meta,
                gridOpts,
                () => cancelRef.current || forceCancelCurrentRef.current,
                onCellDone,
                onWarning,
              );
            }

            const ffmpegLogs = ffmpeg.getAndClearLogs(item.id);
            const itemCancelledMidProcessing = cancelRef.current;
            useTaskStore.getState().updateItem(item.id, {
              outputName: res.outputName,
              outputSize: res.outputSize,
              outputBlob: res.outputBlob,
              status: itemCancelledMidProcessing ? "cancelled" : "done",
              error: undefined,
              processingDurationMs: Date.now() - itemStartTime,
              ffmpegLogs,
            });

            if (!itemCancelledMidProcessing) {
              succeeded++;
            } else {
              cancelled++;
            }

            log(`Finished "${item.file.name}"`);
            useProcessingStore.getState().setStatus((prev) => ({
              ...prev,
              currentPct: 100,
              batchDone: succeeded + errored,
            }));
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            const ffmpegLogs = ffmpeg.getAndClearLogs(item.id);
            const wasForceCancelled = forceCancelCurrentRef.current === true;
            const wasUserCancelled = cancelRef.current;
            forceCancelCurrentRef.current = false;
            const itemErrored = !(wasUserCancelled || wasForceCancelled);
            useTaskStore.getState().updateItem(item.id, {
              status:
                wasUserCancelled || wasForceCancelled ? "cancelled" : "error",
              error: msg,
              processingDurationMs: Date.now() - itemStartTime,
              ffmpegLogs,
            });
            if (itemErrored) {
              errored++;
            } else {
              cancelled++;
            }
            errlog(`Failed "${item.file.name}":`, e);
            const batchProcessed = succeeded + errored;
            useProcessingStore.getState().setStatus((prev) => ({
              ...prev,
              text: `Error on "${item.file.name}": ${msg}`,
              textKind: wasForceCancelled ? "cancelled" : undefined,
              batchDone: batchProcessed,
            }));
          } finally {
            const wasForceCancelledThisTask =
              forceCancelCurrentRef.current === true;
            forceCancelCurrentRef.current = false;
            if (!wasForceCancelledThisTask) {
              await ffmpeg.reset();
            }
          }

          idx++;

          // Pick up any newly added queued items so they're processed in
          // the same batch instead of being left behind.
          const existingIds = new Set(queue.slice(idx).map((q) => q.id));
          const newQueued = useTaskStore
            .getState()
            .items.filter(
              (i) => i.status === "queued" && !existingIds.has(i.id),
            );
          if (newQueued.length > 0) {
            queue.push(...newQueued);
          }
        }
      } finally {
        const batchDurationMs = Date.now() - batchStartTime;
        setProcessingGuard(false);
        useProcessingStore.getState().setIsProcessing(false);
        const total = items.length;
        const parts = [`${succeeded} succeeded`, `${errored} failed`];
        if (cancelled > 0) {
          parts.push(`${cancelled} cancelled`);
        }
        const breakdown = parts.join(", ");
        const label = cancelRef.current ? "Cancelled" : "Done";

        useProcessingStore.getState().setStatus({
          currentPct: 0,
          batchDone: succeeded + errored,
          batchTotal: 0,
          batchStartTime: null,
          batchDurationMs,
          text: `${label}. ${breakdown}. (${total} total, ${formatElapsed(batchDurationMs)})`,
          textKind: cancelRef.current ? "cancelled" : "success",
        });
      }
    },
    [ffmpeg, mediainfo, gridRenderer],
  );

  /** Signal the running batch to stop after the current cell completes. */
  const requestCancel = useCallback(() => {
    cancelRef.current = true;
    useProcessingStore.getState().setStatus((prev) => ({
      ...prev,
      text: "Cancelling…",
    }));
    warn("Cancel requested by user");
  }, []);

  /**
   * Force-kill the FFmpeg WASM instance for the current item only.
   */
  const forceCancel = useCallback(async () => {
    forceCancelCurrentRef.current = true;
    useProcessingStore.getState().setStatus((prev) => ({
      ...prev,
      text: "Force-killing FFmpeg…",
      textKind: "warning",
    }));
    warn("Force cancel: terminating FFmpeg WASM for current item only");
    await ffmpeg.reset();
    try {
      await ffmpeg.reinit();
      useProcessingStore.getState().setStatus((prev) => ({
        ...prev,
        text: "FFmpeg restored — continuing to next file.",
        textKind: "info",
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errlog("FFmpeg re-initialization failed:", msg);
      useProcessingStore.getState().setStatus((prev) => ({
        ...prev,
        text: `FFmpeg restore failed: ${msg}. Subsequent files will be skipped.`,
        textKind: "warning",
      }));
    }
  }, [ffmpeg]);

  return { processAll, requestCancel, forceCancel };
}
