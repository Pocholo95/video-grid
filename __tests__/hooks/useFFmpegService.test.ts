/**
 * Tests for the useFFmpegService hook.
 *
 * Verifies that the hook creates and returns an FFmpegService instance,
 * memoizes it across re-renders, and destroys it on unmount.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFFmpegService } from "@/hooks/useFFmpegService";
import * as ffmpegModule from "@/services/ffmpeg.service";

vi.mock("@/services/ffmpeg.service");

describe("useFFmpegService", () => {
  const createMock = () =>
    vi.fn(() => ({
      isReady: vi.fn().mockResolvedValue(true),
      init: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      getBusyState: vi.fn().mockReturnValue(false),
      onLog: vi.fn(),
    }));

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMock();
    (ffmpegModule.FFmpegService as unknown as ReturnType<typeof createMock>) =
      mock;
  });

  it("returns an FFmpegService instance", () => {
    const { result } = renderHook(() => useFFmpegService());
    expect(result.current).toBeDefined();
    expect(typeof result.current.isReady).toBe("function");
    expect(typeof result.current.destroy).toBe("function");
  });

  it("memoizes the service across re-renders", () => {
    const { result, rerender } = renderHook(() => useFFmpegService());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("creates only one instance", () => {
    const mock = createMock();
    (ffmpegModule.FFmpegService as unknown as ReturnType<typeof createMock>) =
      mock;
    renderHook(() => useFFmpegService());
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("destroys the service on unmount", () => {
    const destroySpy = vi.fn();
    const mock = vi.fn(() => ({
      isReady: vi.fn().mockResolvedValue(true),
      init: vi.fn().mockResolvedValue(undefined),
      destroy: destroySpy,
      getBusyState: vi.fn().mockReturnValue(false),
      onLog: vi.fn(),
    }));
    (ffmpegModule.FFmpegService as unknown as ReturnType<typeof vi.fn>) = mock;

    const { unmount } = renderHook(() => useFFmpegService());
    unmount();
    expect(destroySpy).toHaveBeenCalled();
  });
});
