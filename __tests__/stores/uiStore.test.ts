/**
 * Tests for uiStore.
 *
 * Verifies options management, preview URL, derived totalCells,
 * and selectTotalCells selector.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useUiStore, selectTotalCells } from "@/store/uiStore";
import { DEFAULTS, PROJECT_NAME } from "@/constants";
import type { SavedOptions } from "@/types";

// Mock dependencies
vi.mock("@/store/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        presets: {
          lastUsed: null,
          entries: {},
        },
      },
    }),
  },
}));

vi.mock("@formkit/auto-animate", () => ({
  autoAnimate: vi.fn(),
}));

vi.mock("file-saver", () => ({
  saveAs: vi.fn(),
}));

vi.mock("jszip", () => ({
  default: class {
    file() {}
    generateAsync() {
      return Promise.resolve(new Blob());
    }
  },
}));

let mockTaskItems: {
  id?: string;
  status?: string;
  outputBlob?: Blob | null;
  outputName?: string | null;
}[] = [];

vi.mock("@/store/taskStore", () => ({
  useTaskStore: {
    getState: () => ({ items: mockTaskItems }),
  },
}));

vi.mock("@/store/processingStore", () => ({
  useProcessingStore: {
    getState: () => ({ isProcessing: false }),
  },
}));

beforeEach(() => {
  useUiStore.setState({
    opts: structuredClone(DEFAULTS),
    previewUrl: null,
    isZipping: false,
    totalCells: 0,
  });
});

describe("uiStore - initial state", () => {
  it("initializes opts from defaults when no preset selected", () => {
    const { opts } = useUiStore.getState();
    expect(opts.width).toBe(DEFAULTS.width);
    expect(opts.cols).toBe(DEFAULTS.cols);
    expect(opts.rows).toBe(DEFAULTS.rows);
  });

  it("starts with previewUrl null", () => {
    expect(useUiStore.getState().previewUrl).toBeNull();
  });

  it("starts with isZipping false", () => {
    expect(useUiStore.getState().isZipping).toBe(false);
  });
});

describe("setOpts", () => {
  it("sets opts directly", () => {
    const newOpts = { ...useUiStore.getState().opts, width: 500 };
    useUiStore.getState().setOpts(newOpts);
    expect(useUiStore.getState().opts.width).toBe(500);
  });

  it("sets opts with updater function", () => {
    useUiStore.getState().setOpts((prev: SavedOptions) => ({
      ...prev,
      cols: 6,
    }));
    expect(useUiStore.getState().opts.cols).toBe(6);
  });
});

describe("setPreviewUrl", () => {
  it("sets preview URL", () => {
    useUiStore.getState().setPreviewUrl("blob:test");
    expect(useUiStore.getState().previewUrl).toBe("blob:test");
  });

  it("clears preview URL", () => {
    useUiStore.getState().setPreviewUrl("blob:test");
    useUiStore.getState().setPreviewUrl(null);
    expect(useUiStore.getState().previewUrl).toBeNull();
  });
});

describe("selectTotalCells", () => {
  it("calculates cells from cols x rows", () => {
    useUiStore.getState().setOpts({ ...DEFAULTS, cols: 4, rows: 3 });
    const state = useUiStore.getState();
    expect(selectTotalCells(state)).toBe(12);
  });

  it("uses gridTemplate cell count when template exists", () => {
    const template = {
      cols: 3,
      cells: [
        { id: "c0", x: 0, y: 0, w: 1, h: 1 },
        { id: "c1", x: 1, y: 0, w: 1, h: 1 },
        { id: "c2", x: 0, y: 1, w: 1, h: 1 },
      ],
    };
    useUiStore.getState().setOpts({ ...DEFAULTS, gridTemplate: template });
    const state = useUiStore.getState();
    expect(selectTotalCells(state)).toBe(3);
  });

  it("clamps cols/rows to minimum 1", () => {
    useUiStore.getState().setOpts({ ...DEFAULTS, cols: 0, rows: 0 });
    const state = useUiStore.getState();
    expect(selectTotalCells(state)).toBe(1);
  });

  it("returns cell count for empty gridTemplate", () => {
    useUiStore
      .getState()
      .setOpts({ ...DEFAULTS, gridTemplate: { cols: 3, cells: [] } });
    const state = useUiStore.getState();
    // Falls back to cols * rows when cells array is empty
    expect(selectTotalCells(state)).toBe(DEFAULTS.cols * DEFAULTS.rows);
  });
});

describe("initMainContainer", () => {
  it("calls autoAnimate when element provided", async () => {
    const { initMainContainer } = await import("@/store/uiStore");
    const { autoAnimate } = await import("@formkit/auto-animate");
    const div = document.createElement("div");
    initMainContainer(div);
    expect(autoAnimate).toHaveBeenCalledWith(div);
  });

  it("does nothing when element is null", async () => {
    const { initMainContainer } = await import("@/store/uiStore");
    const { autoAnimate } = await import("@formkit/auto-animate");
    vi.clearAllMocks();
    initMainContainer(null);
    expect(autoAnimate).not.toHaveBeenCalled();
  });
});

describe("downloadAll", () => {
  beforeEach(() => {
    mockTaskItems = [];
  });

  afterEach(async () => {
    // Restore JSZip mock to prevent leakage between tests
    const jszipMod = await import("jszip");
    vi.restoreAllMocks();
    void jszipMod;
  });

  it("returns early when no done items", async () => {
    mockTaskItems = [
      { id: "1", status: "queued", outputBlob: null, outputName: null },
    ];
    await useUiStore.getState().downloadAll();
    expect(useUiStore.getState().isZipping).toBe(false);
  });

  it("sets isZipping to true then false after completion", async () => {
    mockTaskItems = [
      {
        id: "1",
        status: "done",
        outputBlob: new Blob(["data"]),
        outputName: "out1.jpg",
      },
    ];
    await useUiStore.getState().downloadAll();
    expect(useUiStore.getState().isZipping).toBe(false);
  });

  it("calls saveAs with generated ZIP blob", async () => {
    const { saveAs } = await import("file-saver");
    mockTaskItems = [
      {
        id: "1",
        status: "done",
        outputBlob: new Blob(["data"]),
        outputName: "out1.jpg",
      },
    ];
    await useUiStore.getState().downloadAll();
    expect(saveAs).toHaveBeenCalledWith(
      expect.any(Blob),
      `${PROJECT_NAME.toLowerCase()}-outputs.zip`,
    );
  });

  it("resets isZipping even if zip generation fails", async () => {
    // Force JSZip to throw
    const jszipMod = await import("jszip");
    const spy = vi
      .spyOn(jszipMod.default.prototype, "generateAsync")
      .mockRejectedValue(new Error("ZIP failed"));

    mockTaskItems = [
      {
        id: "1",
        status: "done",
        outputBlob: new Blob(["data"]),
        outputName: "out1.jpg",
      },
    ];

    await expect(useUiStore.getState().downloadAll()).rejects.toThrow(
      "ZIP failed",
    );
    expect(useUiStore.getState().isZipping).toBe(false);
    spy.mockRestore();
  });

  it("skips items that are not done or missing blob/name", async () => {
    const { saveAs } = await import("file-saver");
    mockTaskItems = [
      {
        id: "1",
        status: "done",
        outputBlob: new Blob(["a"]),
        outputName: "a.jpg",
      },
      {
        id: "2",
        status: "error",
        outputBlob: new Blob(["b"]),
        outputName: "b.jpg",
      },
      { id: "3", status: "done", outputBlob: null, outputName: "c.jpg" },
    ];
    await useUiStore.getState().downloadAll();
    expect(saveAs).toHaveBeenCalled();
  });
});
