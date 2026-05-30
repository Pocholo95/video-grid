/**
 * Tests for the useProcessorStatus hook.
 *
 * Verifies that the hook returns the expected interface from the processing
 * store, registers log callbacks, and exposes stale detection state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock the processing store
vi.mock("@/store/processingStore", () => ({
  useProcessingStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      isProcessing: false,
      isStale: false,
      staleTaskId: null,
      status: "idle",
      setStatus: vi.fn(),
      setStale: vi.fn(),
      lastProgressTime: Date.now(),
      currentTaskId: null,
    };
    return typeof selector === "function" ? selector(state) : state;
  }),
  getProcessingGuard: vi.fn(() => false),
}));

// Mock useTick
vi.mock("@/lib/useTick", () => ({
  useTick: vi.fn(() => 0),
}));

// Dynamic import will use the mocked modules above
describe("useProcessorStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the expected interface", async () => {
    const { useProcessorStatus } = await import("@/hooks/useProcessorStatus");

    const mockFfmpeg = {
      onLog: vi.fn(),
      getBusyState: vi.fn().mockReturnValue(false),
    };

    const { result } = renderHook(() =>
      useProcessorStatus(vi.fn(), mockFfmpeg as never),
    );

    expect(result.current).toHaveProperty("isProcessing");
    expect(result.current).toHaveProperty("isProcessingRef");
    expect(result.current).toHaveProperty("isStale");
    expect(result.current).toHaveProperty("staleTaskId");
    expect(result.current).toHaveProperty("status");
    expect(result.current).toHaveProperty("setStatus");
  });

  it("registers a log callback on mount", async () => {
    const { useProcessorStatus } = await import("@/hooks/useProcessorStatus");

    const mockFfmpeg = {
      onLog: vi.fn(),
      getBusyState: vi.fn().mockReturnValue(false),
    };

    renderHook(() => useProcessorStatus(vi.fn(), mockFfmpeg as never));
    expect(mockFfmpeg.onLog).toHaveBeenCalled();
  });

  it("unregisters log callback on unmount", async () => {
    const { useProcessorStatus } = await import("@/hooks/useProcessorStatus");

    const mockFfmpeg = {
      onLog: vi.fn(),
      getBusyState: vi.fn().mockReturnValue(false),
    };

    const { unmount } = renderHook(() =>
      useProcessorStatus(vi.fn(), mockFfmpeg as never),
    );

    unmount();
    expect(mockFfmpeg.onLog).toHaveBeenCalledWith(null);
  });

  it("returns default idle state", async () => {
    const { useProcessorStatus } = await import("@/hooks/useProcessorStatus");

    const mockFfmpeg = {
      onLog: vi.fn(),
      getBusyState: vi.fn().mockReturnValue(false),
    };

    const { result } = renderHook(() =>
      useProcessorStatus(vi.fn(), mockFfmpeg as never),
    );

    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isStale).toBe(false);
    expect(result.current.staleTaskId).toBe(null);
    expect(result.current.status).toBe("idle");
  });
});
