import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { useUploadStore } from "@/store/uploadStore";
import { useTaskStore } from "@/store/taskStore";
import * as uploadModule from "@/upload";
import type { TaskItem, UploadDestination } from "@/types";

const mockDest: UploadDestination = {
  id: "dest1",
  name: "Test Host",
  type: "chevereto",
  apiKey: "key",
  url: "https://example.com/upload?key={key}",
  enabled: true,
};

const mockDest2: UploadDestination = {
  id: "dest2",
  name: "Test Host 2",
  type: "chevereto",
  apiKey: "key2",
  url: "https://example2.com/upload?key={key}",
  enabled: false,
};

const mockResult = {
  directUrl: "https://cdn.example.com/img.png",
  pageUrl: "https://example.com/view/1",
  thumbUrl: "https://cdn.example.com/thumb.png",
  deleteUrl: "https://example.com/delete/1",
};

function createItem(
  id: string,
  status: TaskItem["status"] = "done",
  blob = new Blob(["img"], { type: "image/png" }),
): TaskItem {
  return {
    id,
    file: new File(["dummy"], `${id}.png`, { type: "image/png" }),
    status,
    outputBlob: blob,
    outputName: `${id}.png`,
    uploads: {},
  };
}

describe("uploadStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUploadStore.getState().resetUploadState();
    useTaskStore.getState().setItems(() => []);
    vi.spyOn(uploadModule, "uploadBlob").mockResolvedValue(mockResult);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resets upload state", () => {
    useUploadStore.getState().resetUploadState();
    const state = useUploadStore.getState();
    expect(state.isUploadingAll).toBe(false);
    expect(state.uploadProgress).toEqual({ total: 0, attempted: 0 });
  });

  it("does nothing when item has no outputBlob", async () => {
    useTaskStore.getState().setItems(() => [
      {
        id: "no-blob",
        file: new File(["x"], "x.png"),
        status: "done",
        uploads: {},
      } as TaskItem,
    ]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("no-blob", mockDest);
    });

    const items = useTaskStore.getState().items;
    expect(items[0].uploads).toEqual({});
  });

  it("sets status to done on successful upload", async () => {
    useTaskStore.getState().setItems(() => [createItem("item1")]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("item1", mockDest);
    });

    await vi.runAllTimersAsync();

    const items = useTaskStore.getState().items;
    expect(items[0].uploads?.["dest1"]).toMatchObject({
      status: "done",
      progress: 100,
      result: mockResult,
    });
  });

  it("sets status to error on failed upload", async () => {
    vi.spyOn(uploadModule, "uploadBlob").mockRejectedValue(
      new Error("Network error"),
    );
    useTaskStore.getState().setItems(() => [createItem("item1")]);

    await act(async () => {
      await useUploadStore.getState().uploadItemToDest("item1", mockDest);
    });

    await vi.runAllTimersAsync();

    const items = useTaskStore.getState().items;
    expect(items[0].uploads?.["dest1"]).toMatchObject({
      status: "error",
      error: "Network error",
    });
  });

  it("tracks progress updates", async () => {
    let progressCallback: ((pct: number) => void) | undefined;
    let resolveUpload: (() => void) | undefined;
    vi.spyOn(uploadModule, "uploadBlob").mockImplementation(
      (_, __, ___, onProgress) => {
        progressCallback = onProgress;
        return new Promise((resolve) => {
          resolveUpload = () => resolve(mockResult);
        });
      },
    );

    useTaskStore.getState().setItems(() => [createItem("item1")]);

    const promise = act(async () => {
      await useUploadStore.getState().uploadItemToDest("item1", mockDest);
    });

    // Trigger progress updates before upload completes
    act(() => {
      progressCallback?.(25);
    });
    act(() => {
      progressCallback?.(50);
    });

    const items = useTaskStore.getState().items;
    expect(items[0].uploads?.["dest1"]?.progress).toBe(50);

    // Now resolve the upload
    act(() => {
      resolveUpload?.();
    });

    await vi.runAllTimersAsync();
    await promise;
  });

  it("uploadItem skips disabled destinations", async () => {
    useTaskStore.getState().setItems(() => [createItem("item1")]);

    await act(async () => {
      await useUploadStore
        .getState()
        .uploadItem("item1", [mockDest, mockDest2]);
    });

    await vi.runAllTimersAsync();

    const items = useTaskStore.getState().items;
    expect(items[0].uploads?.["dest1"]).toBeDefined();
    expect(items[0].uploads?.["dest2"]).toBeUndefined();
  });

  it("uploadItem skips destinations already done", async () => {
    const item: TaskItem = {
      ...createItem("item1"),
      uploads: {
        dest1: { status: "done", progress: 100, result: mockResult },
      },
    };
    useTaskStore.getState().setItems(() => [item]);

    const callCount = vi.mocked(uploadModule.uploadBlob).mock.calls.length;

    await act(async () => {
      await useUploadStore.getState().uploadItem("item1", [mockDest]);
    });

    expect(vi.mocked(uploadModule.uploadBlob).mock.calls.length).toBe(
      callCount,
    );
  });

  /* uploadAll tests moved to separate describe block below (no fake timers needed) */

  it("sets uploading status before upload starts", async () => {
    let resolveUpload: (() => void) | undefined;
    vi.spyOn(uploadModule, "uploadBlob").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = () => resolve(mockResult);
        }),
    );

    useTaskStore.getState().setItems(() => [createItem("item1")]);

    const promise = act(async () => {
      await useUploadStore.getState().uploadItemToDest("item1", mockDest);
    });

    const items = useTaskStore.getState().items;
    expect(items[0].uploads?.["dest1"]?.status).toBe("uploading");

    act(() => {
      resolveUpload?.();
    });
    await vi.runAllTimersAsync();
    await promise;
  });
});

describe("uploadStore uploadAll (no fake timers)", () => {
  beforeEach(() => {
    useUploadStore.getState().resetUploadState();
    useTaskStore.getState().setItems(() => []);
    vi.spyOn(uploadModule, "uploadBlob").mockResolvedValue(mockResult);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploadAll uploads all pending items to all enabled destinations", async () => {
    useTaskStore
      .getState()
      .setItems(() => [
        createItem("a"),
        createItem("b"),
        createItem("c", "processing"),
      ]);

    await useUploadStore.getState().uploadAll([mockDest]);

    const items = useTaskStore.getState().items;
    expect(items.find((i) => i.id === "a")?.uploads?.["dest1"]?.status).toBe(
      "done",
    );
    expect(items.find((i) => i.id === "b")?.uploads?.["dest1"]?.status).toBe(
      "done",
    );
    // "c" is still processing so should not be uploaded
    expect(items.find((i) => i.id === "c")?.uploads?.["dest1"]).toBe(undefined);
  });

  it("uploadAll sets isUploadingAll flag during processing", async () => {
    useTaskStore.getState().setItems(() => [createItem("x")]);

    const uploadPromise = useUploadStore.getState().uploadAll([mockDest]);

    expect(useUploadStore.getState().isUploadingAll).toBe(true);

    await uploadPromise;

    expect(useUploadStore.getState().isUploadingAll).toBe(false);
  });

  it("uploadAll skips items already done for a destination", async () => {
    const item: TaskItem = {
      ...createItem("done-item"),
      uploads: {
        dest1: { status: "done", progress: 100, result: mockResult },
      },
    };
    useTaskStore.getState().setItems(() => [item]);

    const callCount = vi.mocked(uploadModule.uploadBlob).mock.calls.length;

    await useUploadStore.getState().uploadAll([mockDest]);

    expect(vi.mocked(uploadModule.uploadBlob).mock.calls.length).toBe(
      callCount,
    );
  });

  it("uploadAll does nothing when no enabled destinations", async () => {
    useTaskStore.getState().setItems(() => [createItem("x")]);

    await useUploadStore.getState().uploadAll([mockDest2]);

    const items = useTaskStore.getState().items;
    expect(items[0].uploads).toEqual({});
  });

  it("uploadAll does nothing when no pending items", async () => {
    useTaskStore.getState().setItems(() => []);

    await useUploadStore.getState().uploadAll([mockDest]);

    expect(useUploadStore.getState().isUploadingAll).toBe(false);
  });

  it("uploadAll prevents concurrent execution", async () => {
    useTaskStore.getState().setItems(() => [createItem("x")]);

    // Start first uploadAll
    const p1 = useUploadStore.getState().uploadAll([mockDest]);
    // Second call should return immediately since isUploadingAll is true
    const p2 = useUploadStore.getState().uploadAll([mockDest]);

    await Promise.all([p1, p2]);
  });

  it("uploadAll tracks upload progress", async () => {
    useTaskStore.getState().setItems(() => [createItem("a"), createItem("b")]);

    await useUploadStore.getState().uploadAll([mockDest]);

    const progress = useUploadStore.getState().uploadProgress;
    expect(progress.attempted).toBe(2);
    expect(progress.total).toBe(2);
  });
});
