import { useCallback, useRef, useState } from "react";
import { DEFAULTS } from "../constants";
import { createGridJpg } from "../grid";
import { canNativelyPlay, closeMediaInfo, readMetadataMediaInfo } from "../mediainfo";
import { resetFFmpeg } from "../ffmpeg";
import type { OutputItem, SavedOptions } from "../types";
import { errlog, formatTime, hasUsableMetadata, log, makeId, warn } from "../utils";

export type ProcessorStatus = {
  text: string;
  currentPct: number;
  batchDone: number;
  batchTotal: number;
};

type Updater = (id: string, patch: Partial<OutputItem>) => void;

/**
 * Hook that manages video analysis and grid-generation processing.
 *
 * @param updateItem - Callback to patch a single OutputItem by id.
 */
export function useProcessor(updateItem: Updater) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus]             = useState<ProcessorStatus>({
    text: "Select one or more videos to begin.",
    currentPct: 0, batchDone: 0, batchTotal: 0,
  });

  const cancelRef = useRef(false);

  /**
   * Analyse newly selected files with MediaInfo to populate metadata.
   * Updates each item in-place and calls updateItem after each file.
   *
   * @param files - The File objects selected by the user.
   * @returns A fully-populated OutputItem array ready for processing.
   */
  const analyseFiles = useCallback(async (files: File[]): Promise<OutputItem[]> => {
    setStatus({ text: `Analysing ${files.length} file(s)…`, currentPct: 0, batchDone: 0, batchTotal: files.length });

    const items: OutputItem[] = files.map((file) => ({
      id: makeId(), file, status: "queued",
    }));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const progress = ((i + 1) / files.length) * 100;
      setStatus({ text: `Analysing "${item.file.name}"…`, currentPct: progress, batchDone: i + 1, batchTotal: files.length });

      try {
        const meta = await readMetadataMediaInfo(item.file);
        item.metadata = meta;

        if (!canNativelyPlay(item.file)) {
          item.warning =
            "⚠️ Browser cannot decode this format natively — FFmpeg WASM will be used " +
            "for frame extraction (expect slower processing and higher memory usage for large files).";
        } else if (!hasUsableMetadata(meta)) {
          item.warning =
            "⚠️ Could not read metadata from this file. Processing may fail or produce incorrect output.";
        }

        updateItem(item.id, { metadata: item.metadata, warning: item.warning });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Metadata read failed";
        item.warning = `⚠️ Metadata analysis failed: ${msg}`;
        updateItem(item.id, { warning: item.warning });
        warn(`Metadata failed for "${item.file.name}":`, e);
      }
    }

    setStatus({ text: `${files.length} file(s) ready. Press ▶️ Start Processing.`, currentPct: 0, batchDone: 0, batchTotal: 0 });
    return items;
  }, [updateItem]);

  /**
   * Process all queued items, generating a JPEG grid for each one.
   *
   * @param items - The OutputItem list to process.
   * @param opts  - Current SavedOptions controlling grid layout and appearance.
   */
  const processAll = useCallback(async (items: OutputItem[], opts: SavedOptions) => {
    if (isProcessing || !items.length) return;

    setIsProcessing(true);
    cancelRef.current = false;

    const gridOpts = {
      width:     Math.max(240, opts.width   || DEFAULTS.width),
      cols:      Math.max(1,   opts.cols    || DEFAULTS.cols),
      rows:      Math.max(1,   opts.rows    || DEFAULTS.rows),
      spacing:   Math.max(0,   opts.spacing || DEFAULTS.spacing),
      position:  opts.position  ?? DEFAULTS.position,
      header:    opts.header    ?? DEFAULTS.header,
      bgColor:   opts.bgColor   || DEFAULTS.bgColor,
      textColor: opts.textColor || DEFAULTS.textColor,
    };

    let done = 0;
    setStatus({ text: "Starting…", currentPct: 0, batchDone: 0, batchTotal: items.length });

    try {
      for (const item of items) {
        if (cancelRef.current) {
          updateItem(item.id, { status: "cancelled" });
          done++;
          setStatus((prev) => ({ ...prev, batchDone: done }));
          continue;
        }

        updateItem(item.id, { status: "processing", error: undefined });
        setStatus({ text: `"${item.file.name}" — opening…`, currentPct: 0, batchDone: done, batchTotal: items.length });
        log(`Starting "${item.file.name}"`);

        const onFrameDone = (frameIdx: number, totalFrames: number, tSec: number) => {
          setStatus({
            text:       `"${item.file.name}" — frame ${frameIdx}/${totalFrames} @ ${formatTime(tSec)}`,
            currentPct: (frameIdx / totalFrames) * 100,
            batchDone:  done,
            batchTotal: items.length,
          });
        };

        const onWarning = (message: string) => {
          updateItem(item.id, { warning: message });
          warn(`[${item.file.name}] ${message}`);
        };

        try {
          let meta = item.metadata;
          if (!meta) {
            meta = await readMetadataMediaInfo(item.file, (pct, msg) => {
              setStatus((prev) => ({ ...prev, text: `"${item.file.name}" — ${msg}`, currentPct: pct }));
            });
            updateItem(item.id, { metadata: meta });
          }

          if (!hasUsableMetadata(meta)) {
            throw new Error(
              "MediaInfo could not determine video dimensions or duration. " +
              "The file may be corrupt or in an unrecognised format.",
            );
          }

          const res = await createGridJpg(
            item.file, meta, gridOpts,
            () => cancelRef.current,
            onFrameDone, onWarning,
          );

          updateItem(item.id, {
            outputName: res.outputName,
            outputSize: res.outputSize,
            outputBlob: res.outputBlob,
            status:     cancelRef.current ? "cancelled" : "done",
            error:      undefined,
          });
          log(`Finished "${item.file.name}"`);
          setStatus((prev) => ({ ...prev, currentPct: 100 }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          updateItem(item.id, { status: cancelRef.current ? "cancelled" : "error", error: msg });
          errlog(`Failed "${item.file.name}":`, e);
          setStatus((prev) => ({ ...prev, text: `Error on "${item.file.name}": ${msg}` }));
        }

        done++;
        setStatus((prev) => ({ ...prev, batchDone: done }));
      }
    } finally {
      setIsProcessing(false);
      setStatus((prev) => ({
        ...prev,
        currentPct: 0,
        batchDone:  done,
        text: cancelRef.current
          ? `⏹️ Cancelled after ${done} file(s) processed.`
          : `✅ Done. ${done} file(s) processed.`,
      }));
    }
  }, [isProcessing, updateItem]);

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
    setStatus({ text: "Selection cleared.", currentPct: 0, batchDone: 0, batchTotal: 0 });
  }, []);

  return { isProcessing, status, analyseFiles, processAll, requestCancel, resetState };
}
