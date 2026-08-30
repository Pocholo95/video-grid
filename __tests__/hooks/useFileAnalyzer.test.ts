/**
 * Tests for useFileAnalyzer hook.
 *
 * Tests file analysis: creating TaskItems, reading metadata via ffprobe
 * (through the native bridge), handling metadata failures, and progress
 * reporting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileAnalyzer } from "@/hooks/useFileAnalyzer";
import { defaultMockMeta } from "../helpers/mockServices";
import type { TaskItem, VideoSource } from "@/types";

const { probeMetadataMock } = vi.hoisted(() => ({
  probeMetadataMock: vi.fn(),
}));

vi.mock("@/services/probeMetadata", () => ({
  probeMetadata: probeMetadataMock,
}));

describe("useFileAnalyzer", () => {
  const createMockSource = (name = "test.mp4"): VideoSource => ({
    name,
    size: 1000,
    type: "video/mp4",
    lastModified: 0,
    path: `C:\\fake\\${name}`,
    url: `http://127.0.0.1:0/media/${name}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    probeMetadataMock.mockResolvedValue(defaultMockMeta);
  });

  it("returns analyzeFiles function", () => {
    const { result } = renderHook(() => useFileAnalyzer(vi.fn(), vi.fn()));

    expect(typeof result.current.analyzeFiles).toBe("function");
  });

  it("analyzeFiles creates TaskItems with correct structure", async () => {
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus),
    );

    const sources = [createMockSource("a.mp4"), createMockSource("b.mp4")];
    let items: TaskItem[] = [];

    await act(async () => {
      items = await result.current.analyzeFiles(sources);
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ status: "queued" });
    expect(items[0].source.name).toBe("a.mp4");
    expect(items[1].source.name).toBe("b.mp4");
  });

  it("analyzeFiles populates metadata", async () => {
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus),
    );

    const sources = [createMockSource("test.mp4")];

    await act(async () => {
      await result.current.analyzeFiles(sources);
    });

    // updateItem should have been called with metadata
    expect(mockUpdateItem).toHaveBeenCalled();
    const callArgs = mockUpdateItem.mock.calls[0];
    expect(callArgs[1]).toHaveProperty("metadata");
  });

  it("analyzeFiles handles metadata failure gracefully", async () => {
    probeMetadataMock.mockRejectedValueOnce(new Error("ffprobe failed"));
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus),
    );

    const sources = [createMockSource("bad.mp4")];

    await act(async () => {
      await result.current.analyzeFiles(sources);
    });

    // Should have set a warning
    expect(mockUpdateItem).toHaveBeenCalled();
    const callArgs = mockUpdateItem.mock.calls[0];
    expect(callArgs[1].warning).toContain("Metadata analysis failed");
  });

  it("analyzeFiles calls onItemReady callback", async () => {
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();
    const mockOnReady = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus),
    );

    const sources = [createMockSource("a.mp4"), createMockSource("b.mp4")];

    await act(async () => {
      await result.current.analyzeFiles(sources, mockOnReady);
    });

    expect(mockOnReady).toHaveBeenCalledTimes(2);
  });

  it("analyzeFiles updates progress status", async () => {
    const mockUpdateItem = vi.fn();
    const mockSetStatus = vi.fn();

    const { result } = renderHook(() =>
      useFileAnalyzer(mockUpdateItem, mockSetStatus),
    );

    const sources = [createMockSource("a.mp4"), createMockSource("b.mp4")];

    await act(async () => {
      await result.current.analyzeFiles(sources);
    });

    // setStatus called multiple times: initial + per-file + final
    expect(mockSetStatus).toHaveBeenCalledTimes(4);
  });
});
