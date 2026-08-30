/**
 * Tests for the useProcessor orchestrator hook.
 *
 * Verifies that useProcessor correctly composes the sub-hooks
 * and exposes the expected interface.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProcessor } from "@/hooks/useProcessor";

// Mock all sub-hooks
vi.mock("@/hooks/useProcessorStatus", () => ({
  useProcessorStatus: vi.fn(() => ({
    isProcessing: false,
    isStale: false,
    staleTaskIds: [],
    status: "idle",
    setStatus: vi.fn(),
    isProcessingRef: { current: false },
  })),
}));

vi.mock("@/hooks/useFileAnalyzer", () => ({
  useFileAnalyzer: vi.fn(() => ({
    analyzeFiles: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/hooks/useBatchProcessor", () => ({
  useBatchProcessor: vi.fn(() => ({
    processAll: vi.fn(),
    requestCancel: vi.fn(),
    forceCancel: vi.fn(),
  })),
}));

vi.mock("@/store/processingStore", () => ({
  useProcessingStore: {
    getState: () => ({
      resetState: vi.fn(),
    }),
  },
}));

describe("useProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the expected interface", () => {
    const updateItem = vi.fn();
    const { result } = renderHook(() => useProcessor(updateItem));

    expect(result.current).toHaveProperty("isProcessing");
    expect(result.current).toHaveProperty("isProcessingRef");
    expect(result.current).toHaveProperty("isStale");
    expect(result.current).toHaveProperty("staleTaskIds");
    expect(result.current).toHaveProperty("status");
    expect(result.current).toHaveProperty("setStatus");
    expect(result.current).toHaveProperty("analyzeFiles");
    expect(result.current).toHaveProperty("processAll");
    expect(result.current).toHaveProperty("requestCancel");
    expect(result.current).toHaveProperty("forceCancel");
    expect(result.current).toHaveProperty("resetState");
  });

  it("returns isProcessing false by default", () => {
    const { result } = renderHook(() => useProcessor(vi.fn()));
    expect(result.current.isProcessing).toBe(false);
  });

  it("returns isStale false by default", () => {
    const { result } = renderHook(() => useProcessor(vi.fn()));
    expect(result.current.isStale).toBe(false);
  });

  it("returns idle status by default", () => {
    const { result } = renderHook(() => useProcessor(vi.fn()));
    expect(result.current.status).toBe("idle");
  });

  it("provides resetState function", async () => {
    const { result } = renderHook(() => useProcessor(vi.fn()));
    expect(typeof result.current.resetState).toBe("function");
  });
});
