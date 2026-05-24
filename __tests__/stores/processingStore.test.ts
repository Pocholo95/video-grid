/**
 * Tests for processingStore.
 *
 * Verifies processing state management: status tracking, progress,
 * cancellation, stale detection, and reset.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  useProcessingStore,
  getProcessingGuard,
  setProcessingGuard,
} from "@/store/processingStore";

beforeEach(() => {
  useProcessingStore.getState().resetState();
  setProcessingGuard(false);
});

describe("processingStore - initial state", () => {
  it("starts with isProcessing false", () => {
    expect(useProcessingStore.getState().isProcessing).toBe(false);
  });

  it("starts with empty status", () => {
    const { status } = useProcessingStore.getState();
    expect(status.text).toBe("");
    expect(status.currentPct).toBe(0);
    expect(status.batchDone).toBe(0);
    expect(status.batchTotal).toBe(0);
  });

  it("starts with no current task", () => {
    expect(useProcessingStore.getState().currentTaskId).toBeNull();
  });

  it("starts with isStale false", () => {
    expect(useProcessingStore.getState().isStale).toBe(false);
  });
});

describe("setIsProcessing", () => {
  it("sets isProcessing to true", () => {
    useProcessingStore.getState().setIsProcessing(true);
    expect(useProcessingStore.getState().isProcessing).toBe(true);
  });

  it("sets isProcessing to false", () => {
    useProcessingStore.getState().setIsProcessing(true);
    useProcessingStore.getState().setIsProcessing(false);
    expect(useProcessingStore.getState().isProcessing).toBe(false);
  });
});

describe("setStatus", () => {
  it("sets status directly", () => {
    const newStatus = {
      text: "Analyzing...",
      currentPct: 10,
      batchDone: 0,
      batchTotal: 5,
      batchStartTime: null,
      batchDurationMs: null,
    };
    useProcessingStore.getState().setStatus(newStatus);
    expect(useProcessingStore.getState().status.text).toBe("Analyzing...");
  });

  it("sets status with updater function", () => {
    useProcessingStore.getState().setStatus({
      text: "Start",
      currentPct: 0,
      batchDone: 0,
      batchTotal: 1,
      batchStartTime: null,
      batchDurationMs: null,
    });
    useProcessingStore.getState().setStatus((prev) => ({
      ...prev,
      text: "Done",
      currentPct: 100,
    }));
    expect(useProcessingStore.getState().status.text).toBe("Done");
    expect(useProcessingStore.getState().status.currentPct).toBe(100);
  });
});

describe("setStale / clearStale", () => {
  it("marks task as stale", () => {
    useProcessingStore.getState().setStale("task-1");
    expect(useProcessingStore.getState().isStale).toBe(true);
    expect(useProcessingStore.getState().staleTaskId).toBe("task-1");
  });

  it("clears stale state", () => {
    useProcessingStore.getState().setStale("task-1");
    useProcessingStore.getState().clearStale();
    expect(useProcessingStore.getState().isStale).toBe(false);
    expect(useProcessingStore.getState().staleTaskId).toBeNull();
  });
});

describe("requestCancel / forceCancel", () => {
  it("sets cancellation text on requestCancel", () => {
    useProcessingStore.getState().requestCancel();
    expect(useProcessingStore.getState().status.text).toBe(
      "Cancellation requested…",
    );
    expect(useProcessingStore.getState().status.textKind).toBe("cancelled");
  });

  it("sets force cancellation text on forceCancel", () => {
    useProcessingStore.getState().forceCancel();
    expect(useProcessingStore.getState().status.text).toBe(
      "Force cancellation requested…",
    );
    expect(useProcessingStore.getState().status.textKind).toBe("cancelled");
  });
});

describe("touchProgress", () => {
  it("updates lastProgressTime", () => {
    useProcessingStore.getState().touchProgress();
    expect(useProcessingStore.getState().lastProgressTime).toBeGreaterThan(0);
  });
});

describe("setCurrentTask", () => {
  it("tracks current task ID", () => {
    useProcessingStore.getState().setCurrentTask("task-42");
    expect(useProcessingStore.getState().currentTaskId).toBe("task-42");
  });

  it("clears current task ID with null", () => {
    useProcessingStore.getState().setCurrentTask("task-42");
    useProcessingStore.getState().setCurrentTask(null);
    expect(useProcessingStore.getState().currentTaskId).toBeNull();
  });
});

describe("resetState", () => {
  it("resets all state to initial values", () => {
    useProcessingStore.getState().setIsProcessing(true);
    useProcessingStore.getState().setStale("task-1");
    useProcessingStore.getState().setCurrentTask("task-2");
    useProcessingStore.getState().setStatus({
      text: "Working",
      currentPct: 50,
      batchDone: 3,
      batchTotal: 10,
      batchStartTime: null,
      batchDurationMs: null,
    });

    useProcessingStore.getState().resetState();

    const state = useProcessingStore.getState();
    expect(state.isProcessing).toBe(false);
    expect(state.isStale).toBe(false);
    expect(state.staleTaskId).toBeNull();
    expect(state.currentTaskId).toBeNull();
    expect(state.status.text).toBe("");
    expect(state.lastProgressTime).toBe(0);
  });
});

describe("processing guard", () => {
  it("starts as false", () => {
    expect(getProcessingGuard()).toBe(false);
  });

  it("can be set to true", () => {
    setProcessingGuard(true);
    expect(getProcessingGuard()).toBe(true);
    setProcessingGuard(false);
  });
});
