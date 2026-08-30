/**
 * Tests for the useProcessorStatus hook.
 *
 * Verifies that the hook returns the expected interface from the processing
 * store, registers a global log subscriber, and exposes stale detection state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const setGlobalLogSubscriberMock = vi.fn();

// Mock the processing store
vi.mock("@/store/processingStore", () => ({
  useProcessingStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      isProcessing: false,
      isStale: false,
      staleTaskIds: [],
      status: "idle",
      setStatus: vi.fn(),
      setStale: vi.fn(),
      lastProgressTimeByTask: {},
      activeTaskIds: [],
    };
    return typeof selector === "function" ? selector(state) : state;
  }),
  getProcessingGuard: vi.fn(() => false),
}));

vi.mock("@/services/nativeBridgeEvents", () => ({
  setGlobalLogSubscriber: setGlobalLogSubscriberMock,
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

    const { result } = renderHook(() => useProcessorStatus(vi.fn()));

    expect(result.current).toHaveProperty("isProcessing");
    expect(result.current).toHaveProperty("isProcessingRef");
    expect(result.current).toHaveProperty("isStale");
    expect(result.current).toHaveProperty("staleTaskIds");
    expect(result.current).toHaveProperty("status");
    expect(result.current).toHaveProperty("setStatus");
  });

  it("registers a global log subscriber on mount", async () => {
    const { useProcessorStatus } = await import("@/hooks/useProcessorStatus");

    renderHook(() => useProcessorStatus(vi.fn()));
    expect(setGlobalLogSubscriberMock).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it("unregisters the log subscriber on unmount", async () => {
    const { useProcessorStatus } = await import("@/hooks/useProcessorStatus");

    const { unmount } = renderHook(() => useProcessorStatus(vi.fn()));

    unmount();
    expect(setGlobalLogSubscriberMock).toHaveBeenLastCalledWith(null);
  });

  it("returns default idle state", async () => {
    const { useProcessorStatus } = await import("@/hooks/useProcessorStatus");

    const { result } = renderHook(() => useProcessorStatus(vi.fn()));

    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isStale).toBe(false);
    expect(result.current.staleTaskIds).toEqual([]);
    expect(result.current.status).toBe("idle");
  });
});
