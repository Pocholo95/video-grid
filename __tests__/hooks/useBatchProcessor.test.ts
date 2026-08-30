/**
 * Tests for useBatchProcessor hook.
 *
 * Tests the batch processing logic: dispatching queued items to a worker
 * pool (concurrency pinned to 1 here via the nativeApi.getCpuCount mock
 * below -- this degrades to the same one-at-a-time behavior as the
 * pre-concurrency implementation), generating grid images, tracking
 * progress, and handling errors/cancels.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBatchProcessor } from "@/hooks/useBatchProcessor";
import { defaultMockMeta, createTestOpts } from "../helpers/mockServices";
import type { TaskItem, ProcessorStatus, VideoSource } from "@/types";

vi.mock("@/services/nativeApi", () => ({
  nativeApi: {
    getCpuCount: vi.fn().mockResolvedValue(1),
  },
}));

const { probeMetadataMock, createGridRendererMock, ffmpegInstances } =
  vi.hoisted(() => ({
    probeMetadataMock: vi.fn(),
    createGridRendererMock: vi.fn(),
    ffmpegInstances: [] as Array<{
      taskId: string;
      abortCurrent: ReturnType<typeof vi.fn>;
      getAndClearLogs: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    }>,
  }));

function defaultGridRenderer() {
  const output = {
    outputName: "test.jpg",
    outputSize: 1000,
    outputBlob: new Blob(["mock"], { type: "image/jpeg" }),
  };
  return {
    renderStaticGrid: vi.fn().mockResolvedValue(output),
    renderAnimatedGrid: vi.fn().mockResolvedValue(output),
    renderSequence: vi.fn().mockResolvedValue(output),
    renderGallery: vi
      .fn()
      .mockResolvedValue([
        { blob: new Blob(["mock"]), filename: "test_001.jpg" },
      ]),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock("@/services/probeMetadata", () => ({
  probeMetadata: probeMetadataMock,
}));

vi.mock("@/services/gridRenderer.service", () => ({
  createGridRenderer: createGridRendererMock,
}));

vi.mock("@/services/nativeFfmpeg.service", () => ({
  // Must be a regular function (not an arrow fn) -- useBatchProcessor.ts
  // calls this with `new`, and arrow functions aren't constructible.
  NativeFfmpegService: vi.fn().mockImplementation(function (taskId: string) {
    const instance = {
      taskId,
      init: vi.fn().mockResolvedValue(undefined),
      isReady: () => true,
      bindInputPath: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue(undefined),
      writeData: vi.fn().mockResolvedValue(undefined),
      readData: vi.fn().mockResolvedValue(new Uint8Array()),
      listDir: vi.fn().mockResolvedValue([]),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      reinit: vi.fn().mockResolvedValue(undefined),
      onLog: vi.fn(),
      onProgress: vi.fn(),
      offProgress: vi.fn(),
      setTaskId: vi.fn(),
      getAndClearLogs: vi.fn().mockReturnValue([]),
      getBusyState: vi.fn().mockReturnValue(false),
      setAbortController: vi.fn().mockReturnValue(new AbortController()),
      abortCurrent: vi.fn(),
      setLoggingEnabled: vi.fn(),
      appendLog: vi.fn(),
    };
    ffmpegInstances.push(instance);
    return instance;
  }),
}));

// Mock stores - must be module-level mocks since vi.mock hoists
const mockSetIsProcessing = vi.fn();
const mockSetStatus = vi.fn();
const mockTouchProgress = vi.fn();
const mockAddActiveTask = vi.fn();
const mockRemoveActiveTask = vi.fn();
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
      addActiveTask: mockAddActiveTask,
      removeActiveTask: mockRemoveActiveTask,
    }),
  },
  getProcessingGuard: () => mockProcessingGuard,
  setProcessingGuard: (v: boolean) => {
    mockProcessingGuard = v;
  },
}));

describe("useBatchProcessor", () => {
  const createMockSource = (name = "test.mp4"): VideoSource => ({
    name,
    size: 1000,
    type: "video/mp4",
    lastModified: 0,
    path: `C:\\fake\\${name}`,
    url: `http://127.0.0.1:0/media/${name}`,
  });

  const defaultOpts = createTestOpts();

  beforeEach(() => {
    vi.clearAllMocks();

    createGridRendererMock.mockImplementation(() => defaultGridRenderer());
    probeMetadataMock.mockResolvedValue(defaultMockMeta);
    ffmpegInstances.length = 0;

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
    const { result } = renderHook(() => useBatchProcessor());

    expect(typeof result.current.processAll).toBe("function");
    expect(typeof result.current.requestCancel).toBe("function");
    expect(typeof result.current.forceCancel).toBe("function");
  });

  it("processAll does nothing when processing guard is set", async () => {
    mockProcessingGuard = true;

    const { result } = renderHook(() => useBatchProcessor());

    const items: TaskItem[] = [
      {
        id: "1",
        source: createMockSource(),
        status: "queued",
        metadata: defaultMockMeta,
      },
    ];

    await act(async () => {
      await result.current.processAll(items, defaultOpts);
    });

    // Guard prevents processing - setProcessingGuard should not be called
    // because the function returns early
    expect(mockSetIsProcessing).not.toHaveBeenCalled();
  });

  it("processAll does nothing when items array is empty", async () => {
    const { result } = renderHook(() => useBatchProcessor());

    await act(async () => {
      await result.current.processAll([], defaultOpts);
    });

    expect(mockSetIsProcessing).not.toHaveBeenCalled();
  });

  it("requestCancel updates processing status", async () => {
    const { result } = renderHook(() => useBatchProcessor());

    await act(async () => {
      result.current.requestCancel();
    });

    // Verify setStatus was called
    expect(mockSetStatus).toHaveBeenCalled();
  });

  it("forceCancel reports nothing to cancel when idle", async () => {
    const { result } = renderHook(() => useBatchProcessor());

    await act(async () => {
      await result.current.forceCancel();
    });

    expect(mockSetStatus).toHaveBeenCalledTimes(1);
    const updater = mockSetStatus.mock.calls[0][0] as (
      prev: ProcessorStatus,
    ) => ProcessorStatus;
    expect(updater(mockStatus).text).toBe("Nothing running to force-cancel.");
  });

  it("forceCancel aborts every active task's ffmpeg instance", async () => {
    // A renderer whose static-grid render blocks until we resolve it manually,
    // so we can call forceCancel() while the task is genuinely in flight.
    let releaseRender: (() => void) | null = null;
    const blockedGridRenderer = {
      ...defaultGridRenderer(),
      renderStaticGrid: vi.fn(
        () =>
          new Promise((resolve) => {
            releaseRender = () =>
              resolve({
                outputName: "test.jpg",
                outputSize: 1000,
                outputBlob: new Blob(["mock"]),
              });
          }),
      ),
    };
    createGridRendererMock.mockImplementation(() => blockedGridRenderer);

    const item: TaskItem = {
      id: "1",
      source: createMockSource(),
      status: "queued",
      metadata: defaultMockMeta,
    };
    mockItems.push(item);

    const { result } = renderHook(() => useBatchProcessor());

    let processPromise!: Promise<void>;
    await act(async () => {
      processPromise = result.current.processAll([item], {
        ...defaultOpts,
        outputMode: "static",
      });
      // Let the microtask queue advance so the worker starts and registers
      // its NativeFfmpegService instance before we force-cancel.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ffmpegInstances).toHaveLength(1);

    await act(async () => {
      await result.current.forceCancel();
    });

    expect(ffmpegInstances[0].abortCurrent).toHaveBeenCalled();

    // Let the blocked render resolve so processAll can finish and the test
    // doesn't leave a dangling unresolved promise.
    releaseRender!();
    await act(async () => {
      await processPromise;
    });
  });

  it("cancelling during processing marks all remaining queued items as cancelled without infinite loop", async () => {
    // Use a flag to trigger cancel after the first item starts processing
    let cancelTriggered = false;

    const cancelMockRenderer = {
      ...defaultGridRenderer(),
      renderStaticGrid: vi.fn(
        async (_source, _meta, _opts, cancelCheck: () => boolean) => {
          if (!cancelTriggered) {
            cancelTriggered = true;
          }
          if (cancelTriggered && cancelCheck()) {
            throw new Error("Cancelled");
          }
          return {
            outputName: "test.jpg",
            outputSize: 1000,
            outputBlob: new Blob(["mock"], { type: "image/jpeg" }),
          };
        },
      ),
    };
    createGridRendererMock.mockImplementation(() => cancelMockRenderer);

    const item1: TaskItem = {
      id: "1",
      source: createMockSource("video1.mp4"),
      status: "queued",
      metadata: defaultMockMeta,
    };
    const item2: TaskItem = {
      id: "2",
      source: createMockSource("video2.mp4"),
      status: "queued",
      metadata: defaultMockMeta,
    };
    const item3: TaskItem = {
      id: "3",
      source: createMockSource("video3.mp4"),
      status: "queued",
      metadata: defaultMockMeta,
    };

    mockItems.push(item1, item2, item3);

    const { result } = renderHook(() => useBatchProcessor());

    const items: TaskItem[] = [item1, item2, item3];

    await act(async () => {
      // Start processing
      const processPromise = result.current.processAll(items, defaultOpts);

      // Request cancel — this sets cancelRef.current = true
      // which will be picked up by claimNext() on next iterations
      result.current.requestCancel();

      // Wait for processing to complete
      await processPromise;
    });

    // Items 2 and 3 should be marked as cancelled via the cancel check
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
    const item1: TaskItem = {
      id: "1",
      source: createMockSource("video1.mp4"),
      status: "queued",
      metadata: defaultMockMeta,
    };

    mockItems.push(item1);

    const { result } = renderHook(() => useBatchProcessor());

    const items: TaskItem[] = [item1];

    await act(async () => {
      // Start processing with just 1 item
      const processPromise = result.current.processAll(items, defaultOpts);

      // Add a new queued item to the store while processing
      const item2: TaskItem = {
        id: "2",
        source: createMockSource("video2.mp4"),
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
    const item1: TaskItem = {
      id: "1",
      source: createMockSource("video1.mp4"),
      status: "queued",
      metadata: defaultMockMeta,
    };
    const item2: TaskItem = {
      id: "2",
      source: createMockSource("video2.mp4"),
      status: "queued",
      metadata: defaultMockMeta,
    };
    const item3: TaskItem = {
      id: "3",
      source: createMockSource("video3.mp4"),
      status: "queued",
      metadata: defaultMockMeta,
    };

    mockItems.push(item1, item2, item3);

    const { result } = renderHook(() => useBatchProcessor());

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
