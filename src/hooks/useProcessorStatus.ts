import { useEffect, useCallback } from "react";
import { FFMPEG_STALE_THRESHOLD_MS } from "../constants";
import type { TaskItem } from "../types";
import type { IFFmpegService } from "../types/service";
import {
  useProcessingStore,
  getProcessingGuard,
} from "@/store/processingStore";
import { useTick } from "@/lib/useTick";

type Updater = (id: string, patch: Partial<TaskItem>) => void;

/**
 * Hook that manages the processor UI status state, stale detection,
 * and live log callbacks — extracted from useProcessor for clarity.
 *
 * Now reads all reactive state from the Zustand processingStore instead
 * of maintaining its own duplicate state.
 *
 * Stale detection uses the shared useTick rAF loop instead of a raw
 * setInterval, so it benefits from frame-alignment and tab-hidden pausing.
 */
export function useProcessorStatus(
  updateItem: Updater,
  ffmpegService: IFFmpegService,
) {
  // --- Read all state from Zustand store ---
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const isStale = useProcessingStore((s) => s.isStale);
  const staleTaskId = useProcessingStore((s) => s.staleTaskId);
  const status = useProcessingStore((s) => s.status);
  const setStatus = useProcessingStore((s) => s.setStatus);
  const setStale = useProcessingStore((s) => s.setStale);

  /**
   * Register a live-log callback so that whenever FFmpeg appends a log line,
   * the processor updates the current task's ffmpegLogs array immediately.
   */
  useEffect(() => {
    ffmpegService.onLog((taskId, logs, totalLines) => {
      updateItem(taskId, {
        ffmpegLogs: [...logs],
        ffmpegTotalLines: totalLines,
      });
    });
    return () => {
      ffmpegService.onLog(null);
    };
  }, [updateItem, ffmpegService]);

  /**
   * Stale detection: periodically check if progress has stalled while FFmpeg
   * is busy. If progress hasn't advanced for FFMPEG_STALE_THRESHOLD_MS and
   * FFmpeg is still busy, mark the operation as stale.
   *
   * Uses useTick (rAF-based) instead of setInterval for frame-aligned
   * execution and automatic tab-hidden pausing.
   */
  const _tick = useTick(isProcessing, 5000);
  const checkStale = useCallback(() => {
    const store = useProcessingStore.getState();
    const elapsedSinceProgress = Date.now() - store.lastProgressTime;
    if (
      elapsedSinceProgress > FFMPEG_STALE_THRESHOLD_MS &&
      ffmpegService.getBusyState()
    ) {
      console.warn(
        `[Stale Detection] Progress stalled for ${elapsedSinceProgress}ms while FFmpeg is busy.`,
      );
      setStale(store.currentTaskId);
    }
  }, [ffmpegService, setStale]);

  // Trigger stale check on every _tick increment while processing
  useEffect(() => {
    if (isProcessing) {
      checkStale();
    }
  }, [_tick, isProcessing, checkStale]);

  return {
    isProcessing,
    isProcessingRef: { current: getProcessingGuard() },
    isStale,
    staleTaskId,
    status,
    setStatus,
  };
}
