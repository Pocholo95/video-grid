import {
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
  createContext,
} from "react";
import type { ProcessorStatus, SavedOptions, TaskItem } from "@/types";
import { useFFmpegService } from "@/hooks/useFFmpegService";
import {
  buildStaticGridOptions,
  buildAnimatedGridOptions,
} from "@/gridOptions";
import { useMediaInfoService } from "@/hooks/useMediaInfoService";
import { useProcessorStatus } from "@/hooks/useProcessorStatus";
import { useFileAnalyzer } from "@/hooks/useFileAnalyzer";
import { useBatchProcessor } from "@/hooks/useBatchProcessor";
import { useGridRenderer } from "@/hooks/useGridRenderer";
import { useTasksContext } from "./tasksContext";

/** Processing lifecycle: status, analyze, batch process, cancel. */
interface ProcessingContextValue {
  isProcessing: boolean;
  isProcessingRef: React.MutableRefObject<boolean>;
  isStale: boolean;
  staleTaskId: string | null;
  status: ProcessorStatus;
  setStatus: (
    status: ProcessorStatus | ((prev: ProcessorStatus) => ProcessorStatus),
  ) => void;
  analyzeFiles: (
    files: File[],
    onItemReady?: (item: TaskItem) => void | Promise<void>,
  ) => Promise<TaskItem[]>;
  processAll: (
    tasks: TaskItem[],
    opts: SavedOptions,
    isProcessingRef: { current: boolean },
    isTaskActive?: (id: string) => boolean,
  ) => Promise<void>;
  requestCancel: () => void;
  forceCancel: () => void;
  resetState: () => Promise<void>;
  // Exposed for internal use
  buildStaticGridOptions: typeof buildStaticGridOptions;
  buildAnimatedGridOptions: typeof buildAnimatedGridOptions;
}

const ProcessingContext = createContext<ProcessingContextValue | null>(null);

/** Consume the processing context. */
export function useProcessingContext(): ProcessingContextValue {
  const ctx = useContext(ProcessingContext);
  if (!ctx)
    throw new Error(
      "useProcessingContext must be used within ProcessingProvider",
    );
  return ctx;
}

interface ProcessingProviderProps {
  children: ReactNode;
}

export function ProcessingProvider({ children }: ProcessingProviderProps) {
  // --- Consume tasks context for updateItem ---
  const tasks = useTasksContext();

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
  } = useProcessorStatus(tasks.updateItem, ffmpeg);

  // --- Split hooks ---
  const { analyzeFiles } = useFileAnalyzer(
    tasks.updateItem,
    setStatus,
    mediainfo,
  );
  const gridRenderer = useGridRenderer();
  const { processAll, requestCancel, forceCancel } = useBatchProcessor(
    tasks.updateItem,
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

  const value = useMemo(
    (): ProcessingContextValue => ({
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
      buildStaticGridOptions,
      buildAnimatedGridOptions,
    }),
    [
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
    ],
  );

  return (
    <ProcessingContext.Provider value={value}>
      {children}
    </ProcessingContext.Provider>
  );
}
