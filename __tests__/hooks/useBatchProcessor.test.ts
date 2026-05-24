/**
 * Tests for useBatchProcessor hook.
 *
 * Tests the batch processing logic: iterating over queued items,
 * generating grid images, tracking progress, and handling errors/cancels.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchProcessor } from "@/hooks/useBatchProcessor";
import {
  createMockGridRenderer,
  createMockFFmpegService,
  createMockMediaInfoService,
  defaultMockMeta,
  createTestOpts,
} from "../helpers/mockServices";
import type { TaskItem, ProcessorStatus } from "@/types";

// Mock stores - must be module-level mocks since vi.mock hoists
const mockSetIsProcessing = vi.fn();
const mockSetStatus = vi.fn();
const mockTouchProgress = vi.fn();
const mockSetCurrentTask = vi.fn();
let mockProcessingGuard = false;
let mockStatus: ProcessorStatus = {
  text: "Ready",
  currentPct: 0,
  batchDone: 0,
  batchTotal: 0,
  batchStartTime: null,
  batchDurationMs: null,
};

const mockItems: TaskItem[] = [];
const mockUpdateItem = vi.fn((id: string, updates: Partial<TaskItem>) => {
  const item = mockItems.find((i) => i.id === id);
  if (item) {
    Object.assign(item, updates);
  }
});

vi.mock("@/store/taskStore", () => ({
  useTaskStore: {
    getState: () => ({
      items: mockItems,
      updateItem: mockUpdateItem,
      addItem: vi.fn(),
      removeItem: vi.fn(),
      clearItems: vi.fn(),
      resetAllItems: vi.fn(),
    }),
  },
}));

vi.mock("@/store/processingStore", () => ({
  useProcessingStore: {
    getState: () => ({
      status: mockStatus,
      setIsProcessing: mockSetIsProcessing,
      setStatus: mockSetStatus,
      touchProgress: mockTouchProgress,
      setCurrentTask: mockSetCurrentTask,
    }),
  },
  getProcessingGuard: () => mockProcessingGuard,
  setProcessingGuard: (v: boolean) => {
    mockProcessingGuard = v;
  },
}));

describe("useBatchProcessor", () => {
  let mockFfmpeg: ReturnType<typeof createMockFFmpegService>;
  let mockMediaInfo: ReturnType<typeof createMockMediaInfoService>;
  let mockGridRenderer: ReturnType<typeof createMockGridRenderer>;

  const createMockFile = (name = "test.mp4") =>
    new File(["video"], name, { type: "video/mp4" });

  const defaultOpts = createTestOpts();

  beforeEach(() => {
    vi.clearAllMocks();

    mockFfmpeg = createMockFFmpegService();
    mockMediaInfo = createMockMediaInfoService();
    mockGridRenderer = createMockGridRenderer();

    // Reset state
    mockProcessingGuard = false;
    mockStatus = {
      text: "Ready",
      currentPct: 0,
      batchDone: 0,
      batchTotal: 0,
      batchStartTime: null,
      batchDurationMs: null,
    };
    mockItems.length = 0;
  });

  it("returns processAll, requestCancel, and forceCancel functions", () => {
    const { result } = renderHook(() =>
      useBatchProcessor(mockGridRenderer, mockFfmpeg, mockMediaInfo),
    );

    expect(typeof result.current.processAll).toBe("function");
    expect(typeof result.current.requestCancel).toBe("function");
    expect(typeof result.current.forceCancel).toBe("function");
  });

  it("processAll does nothing when processing guard is set", async () => {
    mockProcessingGuard = true;

    const { result } = renderHook(() =>
      useBatchProcessor(mockGridRenderer, mockFfmpeg, mockMediaInfo),
    );

    const mockFile = createMockFile();
    const items: TaskItem[] = [
      { id: "1", file: mockFile, status: "queued", metadata: defaultMockMeta },
    ];

    await act(async () => {
      await result.current.processAll(items, defaultOpts);
    });

    // Guard prevents processing - setProcessingGuard should not be called
    // because the function returns early
    expect(mockSetIsProcessing).not.toHaveBeenCalled();
  });

  it("processAll does nothing when items array is empty", async () => {
    const { result } = renderHook(() =>
      useBatchProcessor(mockGridRenderer, mockFfmpeg, mockMediaInfo),
    );

    await act(async () => {
      await result.current.processAll([], defaultOpts);
    });

    expect(mockSetIsProcessing).not.toHaveBeenCalled();
  });

  it("requestCancel updates processing status", async () => {
    const { result } = renderHook(() =>
      useBatchProcessor(mockGridRenderer, mockFfmpeg, mockMediaInfo),
    );

    await act(async () => {
      result.current.requestCancel();
    });

    // Verify setStatus was called
    expect(mockSetStatus).toHaveBeenCalled();
  });

  it("forceCancel resets and reinitializes FFmpeg", async () => {
    const resetSpy = vi.fn().mockResolvedValue(undefined);
    const reinitSpy = vi.fn().mockResolvedValue(undefined);
    mockFfmpeg = createMockFFmpegService({
      reset: resetSpy,
      reinit: reinitSpy,
    });

    const { result } = renderHook(() =>
      useBatchProcessor(mockGridRenderer, mockFfmpeg, mockMediaInfo),
    );

    await act(async () => {
      await result.current.forceCancel();
    });

    expect(resetSpy).toHaveBeenCalled();
    expect(reinitSpy).toHaveBeenCalled();
  });

  it("cancelling during processing marks all remaining queued items as cancelled without infinite loop", async () => {
    // Use a flag to trigger cancel after the first item starts processing
    let cancelTriggered = false;

    const cancelMockRenderer = createMockGridRenderer({
      renderStaticGrid: async (_file, _meta, _opts, cancelCheck) => {
        // After the first render call, trigger cancel for remaining items
        if (!cancelTriggered) {
          cancelTriggered = true;
        }
        // If cancelled, simulate the cancel check returning true
        if (cancelTriggered && cancelCheck()) {
          throw new Error("Cancelled");
        }
        return {
          outputName: "test.jpg",
          outputSize: 1000,
          outputBlob: new Blob(["mock"], { type: "image/jpeg" }),
        };
      },
    });

    const mockFile1 = createMockFile("video1.mp4");
    const mockFile2 = createMockFile("video2.mp4");
    const mockFile3 = createMockFile("video3.mp4");

    const item1: TaskItem = {
      id: "1",
      file: mockFile1,
      status: "queued",
      metadata: defaultMockMeta,
    };
    const item2: TaskItem = {
      id: "2",
      file: mockFile2,
      status: "queued",
      metadata: defaultMockMeta,
    };
    const item3: TaskItem = {
      id: "3",
      file: mockFile3,
      status: "queued",
      metadata: defaultMockMeta,
    };

    mockItems.push(item1, item2, item3);

    const { result } = renderHook(() =>
      useBatchProcessor(cancelMockRenderer, mockFfmpeg, mockMediaInfo),
    );

    const items: TaskItem[] = [item1, item2, item3];

    await act(async () => {
      // Start processing
      const processPromise = result.current.processAll(items, defaultOpts);

      // Request cancel — this sets cancelRef.current = true
      // which will be picked up by the while loop on next iterations
      result.current.requestCancel();

      // Wait for processing to complete
      await processPromise;
    });

    // Items 2 and 3 should be marked as cancelled via the cancel check in the while loop
    expect(mockUpdateItem).toHaveBeenCalledWith(
      "2",
      expect.objectContaining({ status: "cancelled" }),
    );
    expect(mockUpdateItem).toHaveBeenCalledWith(
      "3",
      expect.objectContaining({ status: "cancelled" }),
    );

    // Processing should be done
    expect(mockSetIsProcessing).toHaveBeenCalledWith(false);
  });

  it("picks up newly added queued items during processing", async () => {
    const mockFile1 = createMockFile("video1.mp4");
    const mockFile2 = createMockFile("video2.mp4");

    const item1: TaskItem = {
      id: "1",
      file: mockFile1,
      status: "queued",
      metadata: defaultMockMeta,
    };

    mockItems.push(item1);

    const { result } = renderHook(() =>
      useBatchProcessor(mockGridRenderer, mockFfmpeg, mockMediaInfo),
    );

    const items: TaskItem[] = [item1];

    await act(async () => {
      // Start processing with just 1 item
      const processPromise = result.current.processAll(items, defaultOpts);

      // Add a new queued item to the store while processing
      // The dynamic queue logic at the end of the while loop picks up
      // new items with status "queued" from the store
      const item2: TaskItem = {
        id: "2",
        file: mockFile2,
        status: "queued",
        metadata: defaultMockMeta,
      };
      mockItems.push(item2);

      // Wait for processing to complete (should pick up item2)
      await processPromise;
    });

    // Both items should have been processed (status set to done via updateItem)
    expect(mockUpdateItem).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ status: "done" }),
    );
    expect(mockUpdateItem).toHaveBeenCalledWith(
      "2",
      expect.objectContaining({ status: "done" }),
    );
  });

  it("skips items removed from store during processing without error", async () => {
    const mockFile1 = createMockFile("video1.mp4");
    const mockFile2 = createMockFile("video2.mp4");
    const mockFile3 = createMockFile("video3.mp4");

    const item1: TaskItem = {
      id: "1",
      file: mockFile1,
      status: "queued",
      metadata: defaultMockMeta,
    };
    const item2: TaskItem = {
      id: "2",
      file: mockFile2,
      status: "queued",
      metadata: defaultMockMeta,
    };
    const item3: TaskItem = {
      id: "3",
      file: mockFile3,
      status: "queued",
      metadata: defaultMockMeta,
    };

    mockItems.push(item1, item2, item3);

    const { result } = renderHook(() =>
      useBatchProcessor(mockGridRenderer, mockFfmpeg, mockMediaInfo),
    );

    const items: TaskItem[] = [item1, item2, item3];

    await act(async () => {
      // Start processing
      const processPromise = result.current.processAll(items, defaultOpts);

      // Remove item2 and item3 from the store (simulating user removing them)
      // but NOT item1 which is currently processing
      mockItems.splice(0, mockItems.length, item1);

      // Wait for processing to complete
      await processPromise;
    });

    // Item1 should be processed (done), items 2 and 3 should be skipped
    // because the "still exists in store" check at line 76-81 will fail
    expect(mockUpdateItem).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ status: "done" }),
    );

    // Items 2 and 3 should NOT have been updated since they were removed
    expect(mockUpdateItem).not.toHaveBeenCalledWith("2", expect.any(Object));
    expect(mockUpdateItem).not.toHaveBeenCalledWith("3", expect.any(Object));

    // Processing should complete successfully
    expect(mockSetIsProcessing).toHaveBeenCalledWith(false);
  });
});
