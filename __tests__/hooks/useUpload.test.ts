/**
 * Tests for the useUpload hook.
 *
 * Verifies that useUpload correctly delegates to the upload store:
 * - uploadItem delegates to store's uploadItem with destinations
 * - uploadAll passes destinationsOverride or fallback
 * - state exposure (isUploadingAll, uploadProgress)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpload } from "@/hooks/useUpload";
import type { UploadDestination } from "@/types";

const mockUploadItemToDest = vi.fn().mockResolvedValue(undefined);
const mockStoreUploadItem = vi.fn().mockResolvedValue(undefined);
const mockUploadAll = vi.fn().mockResolvedValue(undefined);
const mockResetUploadState = vi.fn();

let mockSettingsDestinations: UploadDestination[];
let mockState: ReturnType<typeof createMockState>;
let mockSettingsState: { settings: { destinations: UploadDestination[] } };

function createMockState() {
  return {
    isUploadingAll: false,
    uploadProgress: { total: 0, attempted: 0 },
    resetUploadState: mockResetUploadState,
    uploadItemToDest: mockUploadItemToDest,
    uploadItem: mockStoreUploadItem,
    uploadAll: mockUploadAll,
  };
}

// Mock stores inline (same pattern as useProcessorStatus.test.ts)
vi.mock("@/store/uploadStore", () => {
  const mockFn = vi.fn((selector: (state: unknown) => unknown) => {
    return selector(mockState);
  }) as unknown as typeof vi.fn & {
    getState: () => ReturnType<typeof createMockState>;
  };
  mockFn.getState = () => mockState;
  return { useUploadStore: mockFn };
});

vi.mock("@/store/settingsStore", () => ({
  useSettingsStore: vi.fn((selector: (state: unknown) => unknown) => {
    return selector(mockSettingsState);
  }),
}));

describe("useUpload", () => {
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
        allowedExtensions: "",
        maxSizeMb: 0,
      },
    ];

    mockState = createMockState();
    mockSettingsState = {
      settings: {
        destinations: mockSettingsDestinations,
      },
    };
  });

  describe("state exposure", () => {
    it("exposes isUploadingAll from store", () => {
      const { result } = renderHook(() => useUpload());
      expect(result.current.isUploadingAll).toBe(false);
    });

    it("exposes uploadProgress from store", () => {
      const { result } = renderHook(() => useUpload());
      expect(result.current.uploadProgress).toEqual({
        total: 0,
        attempted: 0,
      });
    });
  });

  describe("uploadItem", () => {
    it("delegates to store uploadItem with destinations", async () => {
      const { result } = renderHook(() => useUpload());

      await act(async () => {
        await result.current.uploadItem("item1");
      });

      expect(mockStoreUploadItem).toHaveBeenCalledTimes(1);
      expect(mockStoreUploadItem).toHaveBeenCalledWith(
        "item1",
        mockSettingsDestinations,
      );
    });

    it("does not call uploadItemToDest directly", async () => {
      const { result } = renderHook(() => useUpload());

      await act(async () => {
        await result.current.uploadItem("item1");
      });

      // The hook delegates to store.uploadItem, not to uploadItemToDest
      expect(mockUploadItemToDest).not.toHaveBeenCalled();
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
          allowedExtensions: "",
          maxSizeMb: 0,
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
