import { useCallback, useEffect, useRef, useState } from "react";
import { FFMPEG_STALE_THRESHOLD_MS } from "../constants";
import type { ProcessorStatus, TaskItem } from "../types";
import type { IFFmpegService } from "../types/service";

type Updater = (id: string, patch: Partial<TaskItem>) => void;

/**
 * Hook that manages the processor UI status state, stale detection,
 * and live log callbacks — extracted from useProcessor for clarity.
 *
 * Manages its own isProcessing state so the orchestrator doesn't need
 * to pass it through multiple layers.
 */
export function useProcessorStatus(
  updateItem: Updater,
  ffmpegService: IFFmpegService,
) {
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

  // Mutable refs for stale detection (avoid re-renders)
  const isProcessingRef = useRef(isProcessing);
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);
  const lastProgressTimeRef = useRef<number>(Date.now());
  const staleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);

  // Expose setStatus so external callers can update status directly.
  const setStatusRef = setStatus;

  /**
   * Register a live-log callback so that whenever FFmpeg appends a log line,
   * the processor updates the current task's ffmpegLogs array immediately.
   */
  useEffect(() => {
    ffmpegService.onLog((taskId, logs) => {
      updateItem(taskId, { ffmpegLogs: [...logs] });
    });
    return () => {
      ffmpegService.onLog(null);
    };
  }, [updateItem, ffmpegService]);

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
        ffmpegService.getBusyState()
      ) {
        console.warn(
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
  }, [isProcessing, ffmpegService]);

  /** Reset stale detection state. */
  const resetStaleState = useCallback(() => {
    setIsStale(false);
    setStaleTaskId(null);
  }, []);

  /** Update the last progress timestamp to reset stale detection timer. */
  const touchProgress = useCallback(() => {
    lastProgressTimeRef.current = Date.now();
  }, []);

  /** Set the current task ID for stale detection attribution. */
  const setCurrentTask = useCallback((id: string | null) => {
    currentTaskIdRef.current = id;
  }, []);

  /** Clean up stale detection interval. */
  const cleanup = useCallback(() => {
    if (staleIntervalRef.current) {
      clearInterval(staleIntervalRef.current);
      staleIntervalRef.current = null;
    }
    setIsStale(false);
    setStaleTaskId(null);
  }, []);

  return {
    isProcessing,
    setIsProcessing,
    isProcessingRef,
    isStale,
    staleTaskId,
    status,
    setStatus: setStatusRef,
    lastProgressTimeRef,
    currentTaskIdRef,
    resetStaleState,
    touchProgress,
    setCurrentTask,
    cleanup,
  };
}
