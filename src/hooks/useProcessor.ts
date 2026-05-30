import { useCallback } from "react";
import type { TaskItem } from "@/types";
import { useFFmpegService } from "./useFFmpegService";
import { useMediaInfoService } from "./useMediaInfoService";
import { useProcessorStatus } from "./useProcessorStatus";
import { useFileAnalyzer } from "./useFileAnalyzer";
import { useBatchProcessor } from "./useBatchProcessor";
import { useGridRenderer } from "./useGridRenderer";
import { useProcessingStore } from "@/store/processingStore";

/**
 * Orchestrator hook that composes the split service hooks:
 * - useFFmpegService / useMediaInfoService  (WASM lifecycle)
 * - useProcessorStatus                     (stale detection + status)
 * - useFileAnalyzer                        (metadata reading)
 * - useBatchProcessor                      (batch grid generation)
 *
 * @param updateItem - Callback to patch a single TaskItem by id.
 */
export function useProcessor(
  updateItem: (id: string, patch: Partial<TaskItem>) => void,
) {
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
  } = useProcessorStatus(updateItem, ffmpeg);

  // --- Split hooks ---
  const { analyzeFiles } = useFileAnalyzer(updateItem, setStatus, mediainfo);
  const gridRenderer = useGridRenderer();
  const { processAll, requestCancel, forceCancel } = useBatchProcessor(
    gridRenderer,
    ffmpeg,
    mediainfo,
  );

  /** Reset processing state and release WASM resources. */
  const resetState = useCallback(async () => {
    await ffmpeg.destroy();
    mediainfo.destroy();
    useProcessingStore.getState().resetState();
  }, [ffmpeg, mediainfo]);

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
