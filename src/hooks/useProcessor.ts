import { useCallback, useRef, useState } from "react";
import { DEFAULTS } from "../constants";
import { createGridJpg } from "../grid";
import {
  canNativelyPlay,
  closeMediaInfo,
  readMetadataMediaInfo,
} from "../mediainfo";
import { resetFFmpeg } from "../ffmpeg";
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
   * Analyse newly selected files with MediaInfo to populate metadata.
   * Updates each item in-place and calls updateItem after each file.
   *
   * @param files - The File objects selected by the user.
   * @returns A fully-populated TaskItem array ready for processing.
   */
  const analyseFiles = useCallback(
    async (files: File[]): Promise<TaskItem[]> => {
      setStatus({
        text: `Analysing ${files.length} file(s)…`,
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
          text: `Analysing "${item.file.name}"…`,
          currentPct: progress,
          batchDone: i + 1,
          batchTotal: files.length,
          batchStartTime: null,
          batchDurationMs: null,
        });

        try {
          const meta = await readMetadataMediaInfo(item.file);
          item.metadata = meta;
          if (!canNativelyPlay(item.file)) {
            item.warning =
              "Browser cannot decode this format natively — FFmpeg WASM will be used " +
              "for frame extraction (expect slower processing and higher memory usage for large files).";
          } else if (!hasUsableMetadata(meta)) {
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
   */
  const processAll = useCallback(
    async (items: TaskItem[], opts: SavedOptions) => {
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

      let done = 0;
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
          if (cancelRef.current) {
            updateItem(item.id, { status: "cancelled" });
            done++;
            setStatus((prev) => ({ ...prev, batchDone: done }));
            continue;
          }

          const itemStartTime = Date.now();
          updateItem(item.id, {
            status: "processing",
            error: undefined,
            processingStartedAt: itemStartTime,
          });

          setStatus({
            text: `"${item.file.name}" — opening…`,
            currentPct: 0,
            batchDone: done,
            batchTotal: items.length,
            batchStartTime,
            batchDurationMs: null,
          });

          log(`Starting "${item.file.name}"`);

          // For animated mode, non-natively-playable files cannot be processed.
          if (isAnimated && !canNativelyPlay(item.file)) {
            updateItem(item.id, {
              status: "error",
              error:
                "Animated WebP mode requires native browser video support. " +
                "This format is not natively decodable — FFmpeg fallback is unavailable for animated output. " +
                "Disable animated mode to use the FFmpeg fallback for static JPEG generation.",
              warning: undefined,
              processingDurationMs: Date.now() - itemStartTime,
            });
            done++;
            setStatus((prev) => ({
              ...prev,
              batchDone: done,
              text: `"${item.file.name}" — skipped (format unsupported in animated mode)`,
            }));
            continue;
          }

          const onWarning = (message: string) => {
            updateItem(item.id, { warning: message });
            warn(`[${item.file.name}] ${message}`);
          };

          try {
            let meta = item.metadata;
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
                  "The file may be corrupt or in an unrecognised format.",
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
                setStatus((prev) => ({
                  ...prev,
                  text: `"${item.file.name}" — composing frame ${composedFrame}/${totalFrames}`,
                  currentPct:
                    (composedFrame / totalFrames) * ANIMATED_COMPOSE_PCT,
                  batchDone: done,
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
                  batchDone: done,
                  batchTotal: items.length,
                }));
              };

              res = await createAnimatedGridWebP(
                item.file,
                meta,
                animGridOpts,
                () => cancelRef.current,
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
                  batchDone: done,
                  batchTotal: items.length,
                }));
              };

              res = await createGridJpg(
                item.file,
                meta,
                gridOpts,
                () => cancelRef.current,
                onFrameDone,
                onWarning,
              );
            }

            updateItem(item.id, {
              outputName: res.outputName,
              outputSize: res.outputSize,
              outputBlob: res.outputBlob,
              status: cancelRef.current ? "cancelled" : "done",
              error: undefined,
              processingDurationMs: Date.now() - itemStartTime,
            });

            log(`Finished "${item.file.name}"`);
            setStatus((prev) => ({ ...prev, currentPct: 100 }));
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            updateItem(item.id, {
              status: cancelRef.current ? "cancelled" : "error",
              error: msg,
              processingDurationMs: Date.now() - itemStartTime,
            });
            errlog(`Failed "${item.file.name}":`, e);
            setStatus((prev) => ({
              ...prev,
              text: `Error on "${item.file.name}": ${msg}`,
            }));
          }

          done++;
          setStatus((prev) => ({ ...prev, batchDone: done }));
        }
      } finally {
        const batchDurationMs = Date.now() - batchStartTime;
        setIsProcessing(false);
        setStatus((prev) => ({
          ...prev,
          currentPct: 0,
          batchDone: done,
          batchStartTime: null,
          batchDurationMs,
          text: cancelRef.current
            ? `Cancelled after ${done} file(s) processed in ${formatElapsed(batchDurationMs)}.`
            : `Done. ${done} file(s) processed in ${formatElapsed(batchDurationMs)}.`,
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

  return {
    isProcessing,
    status,
    analyseFiles,
    processAll,
    requestCancel,
    resetState,
  };
}
