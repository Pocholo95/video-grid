import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ProcessorStatus } from "@/types";

/**
 * Zustand store for processing lifecycle state.
 * Replaces: src/context/processingContext.tsx (state portion only).
 *
 * The actual processing pipeline (analyzeFiles, processAll) remains in
 * hooks because FFmpeg WASM lifecycle requires React refs and effects.
 * This store holds the reactive state that components consume.
 */
interface ProcessingState {
  // --- Core state ---
  isProcessing: boolean;
  isStale: boolean;
  staleTaskId: string | null;
  status: ProcessorStatus;

  // --- Mutable tracking (not refs - Immer makes those read-only) ---
  lastProgressTime: number;
  currentTaskId: string | null;

  // --- Actions ---
  setIsProcessing: (v: boolean) => void;
  setStatus: (
    status: ProcessorStatus | ((prev: ProcessorStatus) => ProcessorStatus),
  ) => void;
  setStale: (id: string | null) => void;
  clearStale: () => void;
  requestCancel: () => void;
  forceCancel: () => void;
  touchProgress: () => void;
  setCurrentTask: (id: string | null) => void;

  // --- Reset ---
  resetState: () => void;
}

const INITIAL_STATUS: ProcessorStatus = {
  text: "",
  currentPct: 0,
  batchDone: 0,
  batchTotal: 0,
  batchStartTime: null,
  batchDurationMs: null,
};

export const useProcessingStore = create<ProcessingState>()(
  immer((set) => ({
    // --- Initial state ---
    isProcessing: false,
    isStale: false,
    staleTaskId: null,
    status: INITIAL_STATUS,
    lastProgressTime: 0,
    currentTaskId: null,

    // --- Actions ---
    setIsProcessing: (v) =>
      set((state) => {
        state.isProcessing = v;
      }),

    setStatus: (status) =>
      set((state) => {
        const next =
          typeof status === "function" ? status(state.status) : status;
        state.status = next;
      }),

    setStale: (id) =>
      set((state) => {
        state.isStale = id != null;
        state.staleTaskId = id;
      }),

    clearStale: () =>
      set((state) => {
        state.isStale = false;
        state.staleTaskId = null;
      }),

    /**
     * Signal a graceful cancellation request.
     * The actual cancel logic is handled in useBatchProcessor hook.
     */
    requestCancel: () =>
      set((state) => {
        state.status = {
          ...state.status,
          textKind: "cancelled",
          text: "Cancellation requested…",
        };
      }),

    /**
     * Signal a force cancellation.
     * The actual FFmpeg kill logic is handled in useBatchProcessor hook.
     */
    forceCancel: () =>
      set((state) => {
        state.status = {
          ...state.status,
          textKind: "cancelled",
          text: "Force cancellation requested…",
        };
      }),

    /** Record that progress was made (for stale detection). */
    touchProgress: () =>
      set((state) => {
        state.lastProgressTime = Date.now();
      }),

    /** Track which task is currently being processed. */
    setCurrentTask: (id) =>
      set((state) => {
        state.currentTaskId = id;
      }),

    // --- Reset ---
    resetState: () =>
      set((state) => {
        state.isProcessing = false;
        state.isStale = false;
        state.staleTaskId = null;
        state.status = INITIAL_STATUS;
        state.lastProgressTime = 0;
        state.currentTaskId = null;
      }),
  })),
);

/**
 * Module-level guard to prevent concurrent batch processing.
 * Kept outside the Zustand store to avoid Immer proxy read-only issues.
 */
let _isProcessingGuard = false;

export function getProcessingGuard(): boolean {
  return _isProcessingGuard;
}

export function setProcessingGuard(v: boolean): void {
  _isProcessingGuard = v;
}
