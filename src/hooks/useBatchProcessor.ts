import { useCallback, useRef } from "react";
import { ANIMATED_COMPOSE_PCT, ANIMATED_ENCODE_PCT } from "../constants";
import type { IGridRenderer } from "../types/service";
import type { IFFmpegService, IMediaInfoService } from "../types/service";
import type { TaskItem, SavedOptions, ProcessorStatus } from "../types";
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

type Updater = (id: string, patch: Partial<TaskItem>) => void;
type StatusSetter = (
  status: ProcessorStatus | ((prev: ProcessorStatus) => ProcessorStatus),
) => void;
type ProcessingSetter = (value: boolean) => void;

/**
 * Hook that handles batch processing: iterating over queued items,
 * generating grid images, tracking progress, and handling errors/cancels.
 *
 * @param updateItem - Callback to patch a single TaskItem by id.
 * @param setStatus - Callback to update the processor UI status.
 * @param gridRenderer - GridRenderer service (uses FFmpegService internally).
 * @param ffmpeg - FFmpeg service for lifecycle management (reset/reinit/logs).
 * @param mediainfo - MediaInfo service instance.
 */
export function useBatchProcessor(
  updateItem: Updater,
  setStatus: StatusSetter,
  setIsProcessing: ProcessingSetter,
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
    async (
      items: TaskItem[],
      opts: SavedOptions,
      isProcessingRef: { current: boolean },
      isTaskActive?: (id: string) => boolean,
    ) => {
      if (isProcessingRef.current || !items.length) return;
      isProcessingRef.current = true;
      setIsProcessing(true);
      cancelRef.current = false;

      const isAnimated = opts.animated ?? false;

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
          if (isTaskActive && !isTaskActive(item.id)) {
            continue;
          }

          if (cancelRef.current) {
            updateItem(item.id, { status: "cancelled" });
            cancelled++;
            continue;
          }

          const itemStartTime = Date.now();
          ffmpeg.setTaskId(item.id);
          ffmpeg.setAbortController();
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
            if (!meta) {
              meta = await mediainfo.analyze(item.file, (pct, msg) => {
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

            const gridOpts = buildStaticGridOptions(opts, item, meta);
            const animGridOpts = buildAnimatedGridOptions(opts, item, meta);

            let res;
            if (isAnimated) {
              const onAnimFrameDone = (
                composedFrame: number,
                totalFrames: number,
              ) => {
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

              res = await gridRenderer.renderAnimatedGrid(
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
                setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — frame ${frameIdx}/${totalFrames} @ ${formatTime(tSec)}`,
                  currentPct: (frameIdx / totalFrames) * 100,
                  batchDone: succeeded + errored,
                  batchTotal: items.length,
                }));
              };

              res = await gridRenderer.renderStaticGrid(
                item.file,
                meta,
                gridOpts,
                () => cancelRef.current || forceCancelCurrentRef.current,
                onFrameDone,
                onWarning,
              );
            }

            const ffmpegLogs = ffmpeg.getAndClearLogs(item.id);
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
            const ffmpegLogs = ffmpeg.getAndClearLogs(item.id);
            const wasForceCancelled = forceCancelCurrentRef.current === true;
            const wasUserCancelled = cancelRef.current;
            forceCancelCurrentRef.current = false;
            const itemErrored = !(wasUserCancelled || wasForceCancelled);
            updateItem(item.id, {
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
            setStatus((prev) => ({
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
        }
      } finally {
        const batchDurationMs = Date.now() - batchStartTime;
        isProcessingRef.current = false;
        setIsProcessing(false);
        const total = items.length;
        const parts = [`${succeeded} succeeded`, `${errored} failed`];
        if (cancelled > 0) {
          parts.push(`${cancelled} cancelled`);
        }
        const breakdown = parts.join(", ");
        const label = cancelRef.current ? "Cancelled" : "Done";

        setStatus({
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
    [updateItem, setStatus, setIsProcessing, ffmpeg, mediainfo, gridRenderer],
  );

  /** Signal the running batch to stop after the current frame completes. */
  const requestCancel = useCallback(() => {
    cancelRef.current = true;
    setStatus((prev) => ({ ...prev, text: "Cancelling…" }));
    warn("Cancel requested by user");
  }, [setStatus]);

  /**
   * Force-kill the FFmpeg WASM instance for the current item only.
   */
  const forceCancel = useCallback(async () => {
    forceCancelCurrentRef.current = true;
    setStatus((prev) => ({
      ...prev,
      text: "Force-killing FFmpeg…",
      textKind: "warning",
    }));
    warn("Force cancel: terminating FFmpeg WASM for current item only");
    await ffmpeg.reset();
    try {
      await ffmpeg.reinit();
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
  }, [setStatus, ffmpeg]);

  return { processAll, requestCancel, forceCancel };
}
