/**
 * Tests for the useGridRenderer hook.
 *
 * Verifies that the hook returns a GridRenderer instance memoized via useMemo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGridRenderer } from "@/hooks/useGridRenderer";
import { createGridRenderer } from "@/services/gridRenderer.service";

// Stable mock ffmpeg instance
const mockFfmpeg = {
  isReady: vi.fn().mockResolvedValue(true),
  destroy: vi.fn().mockResolvedValue(undefined),
};

// Mock dependencies
vi.mock("@/hooks/useFFmpegService", () => ({
  useFFmpegService: vi.fn(() => mockFfmpeg),
}));

vi.mock("@/services/gridRenderer.service", () => ({
  createGridRenderer: vi.fn(() => ({
    renderStaticGrid: vi.fn(),
    renderAnimatedGrid: vi.fn(),
    destroy: vi.fn(),
  })),
}));

describe("useGridRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a grid renderer instance", () => {
    const { result } = renderHook(() => useGridRenderer());
    expect(result.current).toBeDefined();
    expect(typeof result.current.renderStaticGrid).toBe("function");
    expect(typeof result.current.renderAnimatedGrid).toBe("function");
    expect(typeof result.current.destroy).toBe("function");
  });

  it("calls createGridRenderer with ffmpeg service", () => {
    renderHook(() => useGridRenderer());
    expect(createGridRenderer).toHaveBeenCalled();
  });

  it("memoizes the renderer (same reference on re-renders)", () => {
    const { result, rerender } = renderHook(() => useGridRenderer());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
