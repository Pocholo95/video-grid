/**
 * Tests for the useUpload hook.
 *
 * Verifies that useUpload correctly orchestrates upload logic:
 * - Destination filtering by enabled flag
 * - Status-based skipping (done/uploading)
 * - Sequential processing
 * - taskStore item lookups
 * - uploadAll destination override and fallback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpload } from "@/hooks/useUpload";
import { useUploadStore } from "@/store/uploadStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTaskStore } from "@/store/taskStore";
import type { UploadDestination, TaskItem } from "@/types";

// Mock stores
vi.mock("@/store/uploadStore", () => ({
  useUploadStore: vi.fn(),
}));

vi.mock("@/store/settingsStore", () => ({
  useSettingsStore: vi.fn(),
}));

vi.mock("@/store/taskStore", () => ({
  useTaskStore: vi.fn(),
}));

// Dynamic mock data so tests can control store behavior
let mockUploadStoreState: {
  isUploadingAll: boolean;
  uploadProgress: { total: number; attempted: number };
  resetUploadState: () => void;
  uploadItemToDest: (itemId: string, dest: UploadDestination) => Promise<void>;
  uploadAll: (dests: UploadDestination[]) => Promise<void>;
};

let mockSettingsDestinations: UploadDestination[];
let mockTaskItems: TaskItem[];

describe("useUpload", () => {
  const mockUploadItemToDest = vi.fn().mockResolvedValue(undefined);
  const mockUploadAll = vi.fn().mockResolvedValue(undefined);
  const mockResetUploadState = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsDestinations = [
      {
        id: "d1",
        name: "TestDest",
        type: "chevereto",
        apiKey: "key",
        url: "https://example.com",
        enabled: true,
      },
    ];

    mockTaskItems = [];

    mockUploadStoreState = {
      isUploadingAll: false,
      uploadProgress: { total: 0, attempted: 0 },
      resetUploadState: mockResetUploadState,
      uploadItemToDest: mockUploadItemToDest,
      uploadAll: mockUploadAll,
    };

    vi.mocked(useUploadStore).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => {
        if (typeof selector === "function")
          return selector(mockUploadStoreState);

        return mockUploadStoreState[
          selector as keyof typeof mockUploadStoreState
        ];
      },
    );

    // uploadAll calls useUploadStore.getState() directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.mocked(useUploadStore).getState as any) = () => mockUploadStoreState;

    vi.mocked(useSettingsStore).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => {
        const state = {
          settings: {
            destinations: mockSettingsDestinations,
          },
        };
        if (typeof selector === "function") return selector(state);
        return state;
      },
    );

    vi.mocked(useTaskStore).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => {
        const state = { items: mockTaskItems };
        if (typeof selector === "function") return selector(state);
        return state[selector as keyof typeof state];
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.mocked(useTaskStore).getState as any) = () => ({
      items: mockTaskItems,
      setItems: vi.fn(),
      updateItem: vi.fn(),
      handleUpdateTimestamps: vi.fn(),
      handleRemoveItem: vi.fn(),
      handleRemoveItems: vi.fn(),
      handleRequeueItem: vi.fn(),
      handleRequeueAll: vi.fn(),
      addItem: vi.fn(),
      addItems: vi.fn(),
      hasQueuedFiles: false,
      allMetadataReady: true,
      hasRequeuableItems: false,
      effectiveBatchDone: 0,
      effectiveBatchTotal: 0,
    });
  });

  describe("uploadItem", () => {
    it("filters destinations by enabled flag", async () => {
      mockSettingsDestinations = [
        {
          id: "d1",
          name: "Enabled",
          type: "chevereto",
          apiKey: "k",
          url: "https://a.com",
          enabled: true,
        },
        {
          id: "d2",
          name: "Disabled",
          type: "chevereto",
          apiKey: "k",
          url: "https://b.com",
          enabled: false,
        },
      ];

      mockTaskItems = [
        {
          id: "item1",
          file: new File([""], "test.mp4"),
          status: "done",
          outputBlob: new Blob([""]),
          outputName: "grid.jpg",
        },
      ];

      const { result } = renderHook(() => useUpload());

      await act(async () => {
        await result.current.uploadItem("item1");
      });

      expect(mockUploadItemToDest).toHaveBeenCalledTimes(1);
      expect(mockUploadItemToDest).toHaveBeenCalledWith(
        "item1",
        expect.objectContaining({ id: "d1" }),
      );
      expect(mockUploadItemToDest).not.toHaveBeenCalledWith(
        "item1",
        expect.objectContaining({ id: "d2" }),
      );
    });

    it("skips destinations where upload status is done", async () => {
      mockTaskItems = [
        {
          id: "item1",
          file: new File([""], "test.mp4"),
          status: "done",
          outputBlob: new Blob([""]),
          outputName: "grid.jpg",
          uploads: {
            d1: { status: "done", progress: 100 },
          },
        },
      ];

      const { result } = renderHook(() => useUpload());

      await act(async () => {
        await result.current.uploadItem("item1");
      });

      expect(mockUploadItemToDest).not.toHaveBeenCalled();
    });

    it("skips destinations where upload status is uploading", async () => {
      mockTaskItems = [
        {
          id: "item1",
          file: new File([""], "test.mp4"),
          status: "done",
          outputBlob: new Blob([""]),
          outputName: "grid.jpg",
          uploads: {
            d1: { status: "uploading", progress: 50 },
          },
        },
      ];

      const { result } = renderHook(() => useUpload());

      await act(async () => {
        await result.current.uploadItem("item1");
      });

      expect(mockUploadItemToDest).not.toHaveBeenCalled();
    });

    it("processes destinations sequentially", async () => {
      const callOrder: string[] = [];
      mockUploadItemToDest.mockImplementation(
        async (_itemId: string, dest: UploadDestination) => {
          callOrder.push(dest.id);
        },
      );

      mockSettingsDestinations = [
        {
          id: "d1",
          name: "First",
          type: "chevereto",
          apiKey: "k",
          url: "https://a.com",
          enabled: true,
        },
        {
          id: "d2",
          name: "Second",
          type: "chevereto",
          apiKey: "k",
          url: "https://b.com",
          enabled: true,
        },
      ];

      mockTaskItems = [
        {
          id: "item1",
          file: new File([""], "test.mp4"),
          status: "done",
          outputBlob: new Blob([""]),
          outputName: "grid.jpg",
        },
      ];

      const { result } = renderHook(() => useUpload());

      await act(async () => {
        await result.current.uploadItem("item1");
      });

      expect(mockUploadItemToDest).toHaveBeenCalledTimes(2);
      expect(callOrder).toEqual(["d1", "d2"]);
    });
  });

  describe("uploadAll", () => {
    it("passes destinationsOverride to uploadStore", async () => {
      const customDests: UploadDestination[] = [
        {
          id: "custom",
          name: "Custom",
          type: "chevereto",
          apiKey: "k",
          url: "https://custom.com",
          enabled: true,
        },
      ];

      const { result } = renderHook(() => useUpload());

      await act(async () => {
        await result.current.uploadAll(customDests);
      });

      expect(mockUploadAll).toHaveBeenCalledTimes(1);
      expect(mockUploadAll).toHaveBeenCalledWith(customDests);
    });

    it("uses settingsStore destinations when no override provided", async () => {
      const { result } = renderHook(() => useUpload());

      await act(async () => {
        await result.current.uploadAll();
      });

      expect(mockUploadAll).toHaveBeenCalledTimes(1);
      expect(mockUploadAll).toHaveBeenCalledWith(mockSettingsDestinations);
    });
  });
});
