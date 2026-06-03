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
import { useUploadStore } from "@/store/uploadStore";
import { useSettingsStore } from "@/store/settingsStore";
import type { UploadDestination } from "@/types";

// Mock stores
vi.mock("@/store/uploadStore", () => ({
  useUploadStore: vi.fn(),
}));

vi.mock("@/store/settingsStore", () => ({
  useSettingsStore: vi.fn(),
}));

describe("useUpload", () => {
  const mockUploadItemToDest = vi.fn().mockResolvedValue(undefined);
  const mockStoreUploadItem = vi.fn().mockResolvedValue(undefined);
  const mockUploadAll = vi.fn().mockResolvedValue(undefined);
  const mockResetUploadState = vi.fn();

  let mockSettingsDestinations: UploadDestination[];

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

    const mockState = {
      isUploadingAll: false,
      uploadProgress: { total: 0, attempted: 0 },
      resetUploadState: mockResetUploadState,
      uploadItemToDest: mockUploadItemToDest,
      uploadItem: mockStoreUploadItem,
      uploadAll: mockUploadAll,
    };

    vi.mocked(useUploadStore).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => {
        if (typeof selector === "function") return selector(mockState);
        return mockState[selector as keyof typeof mockState];
      },
    );

    // uploadAll calls useUploadStore.getState() directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.mocked(useUploadStore).getState as any) = () => mockState;

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
