import { useCallback } from "react";
import type { TaskItem } from "../types";
import { useFFmpegService } from "./useFFmpegService";
import { useMediaInfoService } from "./useMediaInfoService";
import { useProcessorStatus } from "./useProcessorStatus";
import { useFileAnalyzer } from "./useFileAnalyzer";
import { useBatchProcessor } from "./useBatchProcessor";
import { useGridRenderer } from "./useGridRenderer";

export type ProcessorStatus = {
  text: string;
  textKind?: "info" | "success" | "warning" | "cancelled";
  currentPct: number;
  batchDone: number;
  batchTotal: number;
  batchStartTime: number | null;
  batchDurationMs: number | null;
};

type Updater = (id: string, patch: Partial<TaskItem>) => void;

/**
 * Orchestrator hook that composes the split service hooks:
 * - useFFmpegService / useMediaInfoService  (WASM lifecycle)
 * - useProcessorStatus                     (stale detection + status)
 * - useFileAnalyzer                        (metadata reading)
 * - useBatchProcessor                      (batch grid generation)
 *
 * @param updateItem - Callback to patch a single TaskItem by id.
 */
export function useProcessor(updateItem: Updater) {
  // --- Services ---
  const ffmpeg = useFFmpegService();
  const mediainfo = useMediaInfoService();

  // --- Status + stale detection ---
  const {
    isProcessing,
    isStale,
    staleTaskId,
    status,
    setStatus,
    isProcessingRef,
    setIsProcessing,
  } = useProcessorStatus(updateItem, ffmpeg);

  // --- Split hooks ---
  const { analyzeFiles } = useFileAnalyzer(updateItem, setStatus, mediainfo);
  const gridRenderer = useGridRenderer();
  const { processAll, requestCancel, forceCancel } = useBatchProcessor(
    updateItem,
    setStatus,
    setIsProcessing,
    gridRenderer,
    ffmpeg,
    mediainfo,
  );

  /** Reset processing state and release WASM resources. */
  const resetState = useCallback(async () => {
    await ffmpeg.destroy();
    mediainfo.destroy();
    setStatus({
      text: "Selection cleared.",
      currentPct: 0,
      batchDone: 0,
      batchTotal: 0,
      batchStartTime: null,
      batchDurationMs: null,
    });
  }, [ffmpeg, mediainfo, setStatus]);

  return {
    isProcessing,
    isProcessingRef,
    isStale,
    staleTaskId,
    status,
    setStatus,
    analyzeFiles,
    processAll,
    requestCancel,
    forceCancel,
    resetState,
  };
}
