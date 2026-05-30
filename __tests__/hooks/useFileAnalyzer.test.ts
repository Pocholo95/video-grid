/**
 * Tests for useFileAnalyzer hook.
 *
 * Tests file analysis: creating TaskItems, reading metadata via MediaInfo,
 * handling metadata failures, and progress reporting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileAnalyzer } from "@/hooks/useFileAnalyzer";
import { createMockMediaInfoService } from "../helpers/mockServices";
import type { TaskItem } from "@/types";

describe("useFileAnalyzer", () => {
  const createMockFile = (name = "test.mp4") =>
    new File(["video"], name, { type: "video/mp4" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns analyzeFiles function", () => {
    const { result } = renderHook(() =>
      useFileAnalyzer(vi.fn(), vi.fn(), createMockMediaInfoService()),
    );

    expect(typeof result.current.analyzeFiles).toBe("function");
  });

  it("analyzeFiles creates TaskItems with correct structure", async () => {
    const mockMediaInfo = createMockMediaInfoService();
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus, mockMediaInfo),
    );

    const files = [createMockFile("a.mp4"), createMockFile("b.mp4")];
    let items: TaskItem[] = [];

    await act(async () => {
      items = await result.current.analyzeFiles(files);
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ status: "queued" });
    expect(items[0].file.name).toBe("a.mp4");
    expect(items[1].file.name).toBe("b.mp4");
  });

  it("analyzeFiles populates metadata", async () => {
    const mockMediaInfo = createMockMediaInfoService();
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus, mockMediaInfo),
    );

    const files = [createMockFile("test.mp4")];

    await act(async () => {
      await result.current.analyzeFiles(files);
    });

    // updateItem should have been called with metadata
    expect(mockUpdateItem).toHaveBeenCalled();
    const callArgs = mockUpdateItem.mock.calls[0];
    expect(callArgs[1]).toHaveProperty("metadata");
  });

  it("analyzeFiles handles metadata failure gracefully", async () => {
    const mockMediaInfo = createMockMediaInfoService({
      analyze: vi.fn().mockRejectedValue(new Error("MediaInfo failed")),
    });
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus, mockMediaInfo),
    );

    const files = [createMockFile("bad.mp4")];

    await act(async () => {
      await result.current.analyzeFiles(files);
    });

    // Should have set a warning
    expect(mockUpdateItem).toHaveBeenCalled();
    const callArgs = mockUpdateItem.mock.calls[0];
    expect(callArgs[1].warning).toContain("Metadata analysis failed");
  });

  it("analyzeFiles calls onItemReady callback", async () => {
    const mockMediaInfo = createMockMediaInfoService();
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();
    const mockOnReady = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus, mockMediaInfo),
    );

    const files = [createMockFile("a.mp4"), createMockFile("b.mp4")];

    await act(async () => {
      await result.current.analyzeFiles(files, mockOnReady);
    });

    expect(mockOnReady).toHaveBeenCalledTimes(2);
  });

  it("analyzeFiles updates progress status", async () => {
    const mockMediaInfo = createMockMediaInfoService();
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus, mockMediaInfo),
    );

    const files = [createMockFile("a.mp4"), createMockFile("b.mp4")];

    await act(async () => {
      await result.current.analyzeFiles(files);
    });

    // setStatus called multiple times: initial + per-file + final
    expect(mockSetStatus).toHaveBeenCalledTimes(4);
  });
});
