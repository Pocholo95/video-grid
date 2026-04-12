import { DEFAULTS } from "./constants";
import { els, setStatus } from "./dom";
import { resetFFmpeg } from "./ffmpeg";
import { createGridJpg } from "./grid";
import { canNativelyPlay, closeMediaInfo, readMetadataMediaInfo } from "./mediainfo";
import {
  renderOutputs,
  revokeAllPreviewUrls,
  updateBatchProgress,
  updateCurrentProgress,
  updateStartButtonState,
} from "./render";
import {
  cancelRequested,
  isProcessing,
  results,
  selectedFiles,
  setCancelRequested,
  setIsProcessing,
} from "./state";
import type { OutputItem, Position } from "./types";
import { errlog, formatTime, hasUsableMetadata, log, makeId, warn } from "./utils";

// ---------------------------------------------------------------------------
// File queueing
// ---------------------------------------------------------------------------

const addFile = async (file: File): Promise<void> => {
  const id   = makeId();
  const item: OutputItem = { id, file, status: "queued" };
  results.set(id, item);
  renderOutputs();

  // MediaInfo metadata + native-play check run in parallel
  const [meta] = await Promise.all([
    readMetadataMediaInfo(file),
    Promise.resolve(canNativelyPlay(file)),
  ]);

  item.metadata = meta;

  if (!canNativelyPlay(file)) {
    item.warning =
      "⚠️ Browser cannot decode this format natively — FFmpeg WASM will be used " +
      "for frame extraction (expect slower processing and higher memory usage for large files).";
    log(`Early FFmpeg warning for "${file.name}": canPlayType returned empty string`);
  } else if (!hasUsableMetadata(meta)) {
    item.warning =
      "⚠️ Could not read metadata from this file. Processing may fail or produce incorrect output.";
    log(`Metadata warning for "${file.name}": MediaInfo returned no usable data`);
  }

  renderOutputs();
  updateStartButtonState();
};

export const queueSelectedFiles = async (): Promise<void> => {
  revokeAllPreviewUrls();
  const files = Array.from(els.files.files ?? []);
  selectedFiles.splice(0, selectedFiles.length, ...files);
  results.clear();
  setStatus(`Analyzing ${files.length} file(s)...`);
  for (const file of selectedFiles) {
    await addFile(file);
  }
  setStatus(`${selectedFiles.length} file(s) ready. Press ▶️ Start Processing.`);
  renderOutputs();
};

// ---------------------------------------------------------------------------
// Main processing loop
// ---------------------------------------------------------------------------

export const processAll = async (): Promise<void> => {
  if (isProcessing) return;
  if (!selectedFiles.length) {
    setStatus("Please select at least one video file.");
    return;
  }

  setIsProcessing(true);
  setCancelRequested(false);
  els.start.disabled  = true;
  els.cancel.disabled = false;
  setStatus("Starting…");
  updateCurrentProgress(0);
  updateBatchProgress(0, selectedFiles.length);

  let done = 0;

  try {
    // Read options from form
    const width     = Math.max(240, Number(els.width.value)   || DEFAULTS.width);
    const cols      = Math.max(1,   Number(els.cols.value)    || DEFAULTS.cols);
    const rows      = Math.max(1,   Number(els.rows.value)    || DEFAULTS.rows);
    const spacing   = Math.max(0,   Number(els.spacing.value) || DEFAULTS.spacing);
    const position  = (els.position.value as Position) ?? DEFAULTS.position;
    const header    = els.header.checked ?? DEFAULTS.header;
    const bgColor   = els.bgColor.value   || DEFAULTS.bgColor;
    const textColor = els.textColor.value || DEFAULTS.textColor;

    const items = Array.from(results.values());

    for (const item of items) {
      if (cancelRequested) {
        item.status = item.status === "processing" ? "queued" : "cancelled";
        renderOutputs();
        continue;
      }

      item.status = "processing";
      item.error  = undefined;
      // Preserve the early FFmpeg/metadata warning set during queueing.
      renderOutputs();
      updateCurrentProgress(0);
      setStatus(`"${item.file.name}" — opening…`);
      log(`Starting "${item.file.name}"`);

      const onFrameDone = (
        frameIdx: number,
        totalFrames: number,
        tSec: number,
      ) => {
        updateCurrentProgress((frameIdx / totalFrames) * 100);
        setStatus(
          `"${item.file.name}" — frame ${frameIdx}/${totalFrames} @ ${formatTime(tSec)}`,
        );
      };

      const onWarning = (message: string) => {
        item.warning = message;
        renderOutputs();
        warn(`[${item.file.name}] ${message}`);
      };

      try {
        // Re-read metadata only if somehow missing (very rare)
        let meta = item.metadata;
        if (!meta) {
          setStatus(`"${item.file.name}" — reading metadata…`);
          meta = await readMetadataMediaInfo(item.file, (pct, msg) => {
            updateCurrentProgress(pct);
            setStatus(`"${item.file.name}" — ${msg}`);
          });
          item.metadata = meta;
        }

        if (!hasUsableMetadata(meta)) {
          throw new Error(
            "MediaInfo could not determine video dimensions or duration. " +
            "The file may be corrupt or in an unrecognised format.",
          );
        }

        renderOutputs();

        const res = await createGridJpg(
          item.file,
          meta,
          { width, cols, rows, spacing, position, header, bgColor, textColor },
          onFrameDone,
          onWarning,
        );

        item.outputName = res.outputName;
        item.outputSize = res.outputSize;
        item.outputBlob = res.outputBlob;
        item.status     = cancelRequested ? "cancelled" : "done";
        item.error      = undefined;

        log(`Finished "${item.file.name}"`);
        updateCurrentProgress(100);
      } catch (e) {
        item.status = cancelRequested ? "cancelled" : "error";
        item.error  = e instanceof Error ? e.message : "Unknown error";
        errlog(`Failed "${item.file.name}":`, e);
        setStatus(`Error on "${item.file.name}": ${item.error}`);
      }

      done++;
      updateBatchProgress(done, items.length);
      renderOutputs();
    }
  } catch (e) {
    errlog("Batch failed:", e);
    setStatus(e instanceof Error ? e.message : "Batch failed");
  } finally {
    setIsProcessing(false);
    els.cancel.disabled = true;
    updateCurrentProgress(0);
    setStatus(
      `${cancelRequested ? `⏹️ Cancelled after ` : `✅ Done. `}` +
      `${done} file(s) processed. Press ▶️ Start Processing to restart.`,
    );
    updateStartButtonState();
  }
};

// ---------------------------------------------------------------------------
// Clear handler (exported so main.ts can wire it)
// ---------------------------------------------------------------------------

export const clearAll = (): void => {
  if (isProcessing) return;
  revokeAllPreviewUrls();
  resetFFmpeg();
  closeMediaInfo();
  selectedFiles.splice(0, selectedFiles.length);
  results.clear();
  els.files.value            = "";
  els.currentPct.textContent = "0%";
  els.batchPct.textContent   = "0%";
  els.currentProgress.value  = 0;
  els.batchProgress.value    = 0;
  setStatus("Selection cleared.");
  renderOutputs();
  updateStartButtonState();
};
