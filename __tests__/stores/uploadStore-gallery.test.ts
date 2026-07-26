import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { useUploadStore } from "@/store/uploadStore";
import { useTaskStore } from "@/store/taskStore";
import * as uploadModule from "@/upload";
import * as corsTunnel from "@/lib/cors-tunnel";
import type { TaskItem, UploadDestination } from "@/types";

// Mock the settingsStore module to avoid triggering localStorage during import
vi.mock("@/store/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

// Import after mock is set up so the mocked version is used
import { useSettingsStore } from "@/store/settingsStore";

const mockDest: UploadDestination = {
  id: "dest1",
  name: "Test Host",
  type: "chevereto",
  apiKey: "key",
  url: "https://example.com/upload?key={key}",
  enabled: true,
  allowedExtensions: "",
  maxSizeMb: 0,
};

const mockResult = {
  directUrl: "https://cdn.example.com/img.png",
  pageUrl: "https://example.com/view/1",
  thumbUrl: "https://cdn.example.com/thumb.png",
  deleteUrl: "https://example.com/delete/1",
};

function createGalleryItem(id: string, numFrames: number = 3): TaskItem {
  const galleryImages = Array.from(
    { length: numFrames },
    () => new Blob(["frame"], { type: "image/jpeg" }),
  );
  const galleryImageNames = Array.from(
    { length: numFrames },
    (_, i) => `${id}_frame_${i}.jpg`,
  );
  return {
    id,
    file: new File(["dummy"], `${id}.mp4`, { type: "video/mp4" }),
    status: "done",
    outputBlob: new Blob(["video"], { type: "video/mp4" }),
    outputName: `${id}.mp4`,
    galleryImages,
    galleryImageNames,
    uploads: {},
  };
}

describe("uploadStore gallery mode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUploadStore.getState().resetUploadState();
    useTaskStore.getState().setItems(() => []);
    vi.spyOn(uploadModule, "uploadBlob").mockResolvedValue(mockResult);
    vi.spyOn(corsTunnel, "detectCORSTunnelAvailable").mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uploads all gallery frames as separate fileResults", async () => {
    const item = createGalleryItem("gallery1", 3);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("gallery1", mockDest);
    });

    await vi.runAllTimersAsync();

    const items = useTaskStore.getState().items;
    const fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults).toBeDefined();
    expect(fileResults?.length).toBe(3);
    expect(fileResults?.every((f) => f.status === "done")).toBe(true);
  });

  it("fileResults length matches gallery frame count", async () => {
    const item = createGalleryItem("gallery2", 5);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("gallery2", mockDest);
    });

    await vi.runAllTimersAsync();

    const items = useTaskStore.getState().items;
    const fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.length).toBe(5);
  });

  it("skips already-done gallery frames on re-upload", async () => {
    const item = createGalleryItem("gallery3", 2);
    useTaskStore.getState().setItems(() => [item]);

    // First upload
    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("gallery3", mockDest);
    });
    await vi.runAllTimersAsync();

    const callCount = vi.mocked(uploadModule.uploadBlob).mock.calls.length;

    // Re-upload - should skip all done files
    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("gallery3", mockDest);
    });
    await vi.runAllTimersAsync();

    // No new upload calls since all frames are done
    expect(vi.mocked(uploadModule.uploadBlob).mock.calls.length).toBe(
      callCount,
    );
  });

  it("re-uploads errored gallery frames on re-upload", async () => {
    // First call succeeds, second call fails
    vi.spyOn(uploadModule, "uploadBlob").mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockResult);
      return Promise.reject(new Error("Network error"));
    });
    let callCount = 0;

    const item = createGalleryItem("gallery4", 2);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("gallery4", mockDest);
    });
    await vi.runAllTimersAsync();

    let items = useTaskStore.getState().items;
    let fileResults = items[0].uploads?.["dest1"]?.fileResults;
    // First frame done, second frame errored
    expect(fileResults?.[0].status).toBe("done");
    expect(fileResults?.[1].status).toBe("error");

    // Reset mock to succeed for re-upload
    vi.mocked(uploadModule.uploadBlob).mockResolvedValue(mockResult);

    // Re-upload - should only attempt the errored frame
    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("gallery4", mockDest);
    });
    await vi.runAllTimersAsync();

    items = useTaskStore.getState().items;
    fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.[0].status).toBe("done");
    expect(fileResults?.[1].status).toBe("done");
  });

  it("gallery item is eligible when galleryImageNames match allowedExtensions", async () => {
    const destJpgOnly: UploadDestination = {
      id: "dest-jpg-gallery",
      name: "JPG Only",
      type: "chevereto",
      apiKey: "k",
      url: "https://jpg.com/upload?key={key}",
      enabled: true,
      allowedExtensions: ".jpg,.jpeg",
      maxSizeMb: 0,
    };

    // Gallery item with .mp4 outputName but .jpg galleryImageNames
    const item = createGalleryItem("gallery5", 2);
    // outputName is .mp4 (would be rejected), but galleryImageNames are .jpg
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItem("gallery5", [destJpgOnly]);
    });

    await vi.runAllTimersAsync();

    const items = useTaskStore.getState().items;
    expect(items[0].uploads?.["dest-jpg-gallery"]).toBeDefined();
    expect(items[0].uploads?.["dest-jpg-gallery"]?.status).toBe("done");
  });

  it("gallery item is skipped when galleryImageNames don't match allowedExtensions", async () => {
    const destPngOnly: UploadDestination = {
      id: "dest-png-gallery",
      name: "PNG Only",
      type: "chevereto",
      apiKey: "k",
      url: "https://png.com/upload?key={key}",
      enabled: true,
      allowedExtensions: ".png",
      maxSizeMb: 0,
    };

    // Gallery item with .jpg frames (not .png)
    const item = createGalleryItem("gallery6", 2);
    useTaskStore.getState().setItems(() => [item]);

    const callCount = vi.mocked(uploadModule.uploadBlob).mock.calls.length;

    await act(async () => {
      await useUploadStore.getState().uploadItem("gallery6", [destPngOnly]);
    });

    // Should be skipped - .jpg not in allowed extensions
    expect(vi.mocked(uploadModule.uploadBlob).mock.calls.length).toBe(
      callCount,
    );
    const items = useTaskStore.getState().items;
    expect(items[0].uploads?.["dest-png-gallery"]).toBeUndefined();
  });
});

describe("uploadStore file operations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUploadStore.getState().resetUploadState();
    useTaskStore.getState().setItems(() => []);
    vi.spyOn(uploadModule, "uploadBlob").mockResolvedValue(mockResult);
    vi.spyOn(corsTunnel, "detectCORSTunnelAvailable").mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("removeFileResult marks file as deleted and re-derives state", async () => {
    const item = createGalleryItem("op1", 3);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("op1", mockDest);
    });
    await vi.runAllTimersAsync();

    // All 3 files done
    let items = useTaskStore.getState().items;
    let fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.length).toBe(3);
    expect(fileResults?.every((f) => f.status === "done")).toBe(true);

    // Remove file at index 1
    useUploadStore.getState().removeFileResult("op1", "dest1", 1);

    items = useTaskStore.getState().items;
    fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.[1].status).toBe("deleted");
    expect(fileResults?.[1].result).toBeUndefined();
    expect(fileResults?.[1].progress).toBe(0);
    // Other files remain done
    expect(fileResults?.[0].status).toBe("done");
    expect(fileResults?.[2].status).toBe("done");
  });

  it("removeFileResult updates dest status when all remaining files are done", async () => {
    const item = createGalleryItem("op2", 2);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("op2", mockDest);
    });
    await vi.runAllTimersAsync();

    // Remove one file
    useUploadStore.getState().removeFileResult("op2", "dest1", 0);

    const items = useTaskStore.getState().items;
    // Remaining file is still done, so dest status stays done
    expect(items[0].uploads?.["dest1"]?.status).toBe("done");
  });

  it("clearUploadResult resets single file", async () => {
    const item = createGalleryItem("op3", 3);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("op3", mockDest);
    });
    await vi.runAllTimersAsync();

    // Clear file at index 1
    useUploadStore.getState().clearUploadResult("op3", "dest1", 1);

    const items = useTaskStore.getState().items;
    const fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.[1].status).toBe("idle");
    expect(fileResults?.[1].progress).toBe(0);
    expect(fileResults?.[1].result).toBeUndefined();
    // Others remain done
    expect(fileResults?.[0].status).toBe("done");
    expect(fileResults?.[2].status).toBe("done");
  });

  it("clearUploadResult without fileIndex clears entire destination", async () => {
    const item = createGalleryItem("op4", 2);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("op4", mockDest);
    });
    await vi.runAllTimersAsync();

    // Clear entire destination
    useUploadStore.getState().clearUploadResult("op4", "dest1");

    const items = useTaskStore.getState().items;
    const destState = items[0].uploads?.["dest1"];
    expect(destState?.status).toBe("idle");
    expect(destState?.progress).toBe(0);
    expect(destState?.result).toBeUndefined();
    expect(destState?.fileResults).toBeUndefined();
  });

  it("retryFailedFiles re-uploads only errored files", async () => {
    // Setup: first upload succeeds, second fails
    vi.spyOn(uploadModule, "uploadBlob").mockImplementation(() => {
      callCount++;
      if (callCount <= 1) return Promise.resolve(mockResult);
      return Promise.reject(new Error("Fail"));
    });
    let callCount = 0;

    const item = createGalleryItem("retry1", 2);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("retry1", mockDest);
    });
    await vi.runAllTimersAsync();

    let items = useTaskStore.getState().items;
    let fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.[0].status).toBe("done");
    expect(fileResults?.[1].status).toBe("error");

    // Mock settingsStore to return our destination
    vi.spyOn(useSettingsStore, "getState").mockReturnValue({
      settings: { destinations: [mockDest] },
    } as never);

    // Reset mock to succeed
    vi.mocked(uploadModule.uploadBlob).mockResolvedValue(mockResult);

    await act(async () => {
      await useUploadStore.getState().retryFailedFiles("retry1", "dest1");
    });
    await vi.runAllTimersAsync();

    items = useTaskStore.getState().items;
    fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.[0].status).toBe("done");
    expect(fileResults?.[1].status).toBe("done");
  });

  it("retrySingleFile re-uploads a specific file by index", async () => {
    // First upload fails for all
    vi.spyOn(uploadModule, "uploadBlob").mockRejectedValue(
      new Error("Network error"),
    );

    const item = createGalleryItem("retry2", 3);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("retry2", mockDest);
    });
    await vi.runAllTimersAsync();

    let items = useTaskStore.getState().items;
    let fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.every((f) => f.status === "error")).toBe(true);

    // Mock settingsStore
    vi.spyOn(useSettingsStore, "getState").mockReturnValue({
      settings: { destinations: [mockDest] },
    } as never);

    // Reset mock to succeed
    vi.mocked(uploadModule.uploadBlob).mockResolvedValue(mockResult);

    // Retry only file at index 1
    await act(async () => {
      await useUploadStore.getState().retrySingleFile("retry2", "dest1", 1);
    });
    await vi.runAllTimersAsync();

    items = useTaskStore.getState().items;
    fileResults = items[0].uploads?.["dest1"]?.fileResults;
    expect(fileResults?.[0].status).toBe("error");
    expect(fileResults?.[1].status).toBe("done");
    expect(fileResults?.[2].status).toBe("error");
  });

  it("retrySingleFile does nothing when file is not in error state", async () => {
    const item = createGalleryItem("retry3", 2);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("retry3", mockDest);
    });
    await vi.runAllTimersAsync();

    // All files are done, not error
    vi.spyOn(useSettingsStore, "getState").mockReturnValue({
      settings: { destinations: [mockDest] },
    } as never);

    const callCount = vi.mocked(uploadModule.uploadBlob).mock.calls.length;

    // Retry file 0 (already done) - should still upload since it resets to idle first
    await act(async () => {
      await useUploadStore.getState().retrySingleFile("retry3", "dest1", 0);
    });
    await vi.runAllTimersAsync();

    // It does reset to idle then re-uploads, so uploadBlob is called
    expect(vi.mocked(uploadModule.uploadBlob).mock.calls.length).toBe(
      callCount + 1,
    );
  });
});

describe("uploadStore deriveDestState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUploadStore.getState().resetUploadState();
    useTaskStore.getState().setItems(() => []);
    vi.spyOn(uploadModule, "uploadBlob").mockResolvedValue(mockResult);
    vi.spyOn(corsTunnel, "detectCORSTunnelAvailable").mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("dest status is 'uploading' when any file is uploading", async () => {
    const item = createGalleryItem("derive1", 3);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("derive1", mockDest);
      await vi.runAllTimersAsync();
    });

    const items = useTaskStore.getState().items;
    // All done after successful upload
    expect(items[0].uploads?.["dest1"]?.status).toBe("done");
  });

  it("dest status is 'error' when any file errored and none uploading", async () => {
    vi.spyOn(uploadModule, "uploadBlob").mockRejectedValue(
      new Error("Network error"),
    );

    const item = createGalleryItem("derive2", 2);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("derive2", mockDest);
      await vi.runAllTimersAsync();
    });

    const items = useTaskStore.getState().items;
    expect(items[0].uploads?.["dest1"]?.status).toBe("error");
  });

  it("deleted files are excluded from dest state derivation", async () => {
    const item = createGalleryItem("derive3", 3);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("derive3", mockDest);
      await vi.runAllTimersAsync();
    });

    // Delete all 3 files
    useUploadStore.getState().removeFileResult("derive3", "dest1", 0);
    useUploadStore.getState().removeFileResult("derive3", "dest1", 1);
    useUploadStore.getState().removeFileResult("derive3", "dest1", 2);

    const items = useTaskStore.getState().items;
    // When all files are deleted, dest state should be idle
    expect(items[0].uploads?.["dest1"]?.status).toBe("idle");
    expect(items[0].uploads?.["dest1"]?.progress).toBe(0);
  });

  it("progress is average of all file progress values", async () => {
    const item = createGalleryItem("derive4", 2);
    useTaskStore.getState().setItems(() => [item]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("derive4", mockDest);
      await vi.runAllTimersAsync();
    });

    const items = useTaskStore.getState().items;
    // Both files at 100%, average is 100
    expect(items[0].uploads?.["dest1"]?.progress).toBe(100);
  });
});

describe("uploadAll with gallery items", () => {
  beforeEach(() => {
    useUploadStore.getState().resetUploadState();
    useTaskStore.getState().setItems(() => []);
    vi.spyOn(uploadModule, "uploadBlob").mockResolvedValue(mockResult);
    vi.spyOn(corsTunnel, "detectCORSTunnelAvailable").mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploadAll handles gallery items correctly", async () => {
    const galleryItem = createGalleryItem("gallery-all", 2);
    const singleItem = {
      id: "single-all",
      file: new File(["dummy"], "single.png", { type: "image/png" }),
      status: "done" as const,
      outputBlob: new Blob(["img"], { type: "image/png" }),
      outputName: "single.png",
      uploads: {},
    };
    useTaskStore.getState().setItems(() => [galleryItem, singleItem]);

    await useUploadStore.getState().uploadAll([mockDest]);

    const items = useTaskStore.getState().items;
    // Gallery item: 2 frames, both done
    const gallery = items.find((i) => i.id === "gallery-all");
    expect(gallery?.uploads?.["dest1"]?.status).toBe("done");
    expect(gallery?.uploads?.["dest1"]?.fileResults?.length).toBe(2);

    // Single item: 1 file, done
    const single = items.find((i) => i.id === "single-all");
    expect(single?.uploads?.["dest1"]?.status).toBe("done");
  });

  it("uploadAll progress accounts for gallery frame count", async () => {
    // Gallery with 3 frames + 1 single file = 4 total uploads
    const galleryItem = createGalleryItem("gallery-progress", 3);
    const singleItem = {
      id: "single-progress",
      file: new File(["dummy"], "single.png", { type: "image/png" }),
      status: "done" as const,
      outputBlob: new Blob(["img"], { type: "image/png" }),
      outputName: "single.png",
      uploads: {},
    };
    useTaskStore.getState().setItems(() => [galleryItem, singleItem]);

    await useUploadStore.getState().uploadAll([mockDest]);

    const progress = useUploadStore.getState().uploadProgress;
    // 3 gallery frames + 1 single file = 4 total, 2 items * 1 dest = but total
    // is computed as sum(fileCount) * enabled.length = (3 + 1) * 1 = 4
    expect(progress.total).toBe(4);
    expect(progress.attempted).toBe(2); // 2 items uploaded
  });
});
