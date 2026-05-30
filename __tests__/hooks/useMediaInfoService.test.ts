/**
 * Tests for the useMediaInfoService hook.
 *
 * Verifies that the hook creates and returns a MediaInfoService instance,
 * memoizes it across re-renders, and destroys it on unmount.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMediaInfoService } from "@/hooks/useMediaInfoService";
import * as mediainfoModule from "@/services/mediainfo.service";

vi.mock("@/services/mediainfo.service");

describe("useMediaInfoService", () => {
  const createMock = () =>
    vi.fn(function () {
      return {
        init: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        analyze: vi.fn().mockResolvedValue({}),
      };
    });

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMock();
    (mediainfoModule.MediaInfoService as unknown as ReturnType<
      typeof createMock
    >) = mock;
  });

  it("returns a MediaInfoService instance", () => {
    const { result } = renderHook(() => useMediaInfoService());
    expect(result.current).toBeDefined();
    expect(typeof result.current.init).toBe("function");
    expect(typeof result.current.destroy).toBe("function");
  });

  it("memoizes the service across re-renders", () => {
    const { result, rerender } = renderHook(() => useMediaInfoService());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("creates only one instance", () => {
    const mock = createMock();
    (mediainfoModule.MediaInfoService as unknown as ReturnType<
      typeof createMock
    >) = mock;
    renderHook(() => useMediaInfoService());
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("destroys the service on unmount", () => {
    const destroySpy = vi.fn();
    const mock = vi.fn(function () {
      return {
        init: vi.fn().mockResolvedValue(undefined),
        destroy: destroySpy,
        analyze: vi.fn().mockResolvedValue({}),
      };
    });
    (mediainfoModule.MediaInfoService as unknown as ReturnType<typeof vi.fn>) =
      mock;

    const { unmount } = renderHook(() => useMediaInfoService());
    unmount();
    expect(destroySpy).toHaveBeenCalled();
  });
});
